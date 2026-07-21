"""
Shared API clients for Doko -- used by both the Flask app (app.py) and the
Kaggle notebook, so both demonstrate the exact same real API calls.
"""
import os
import time
from html.parser import HTMLParser

import pykakasi
import requests
from dotenv import load_dotenv
from pypinyin import pinyin, Style

_kks = pykakasi.kakasi()

load_dotenv()

YVP_APP_KEY = os.environ.get("YVP_APP_KEY")
GLOO_CLIENT_ID = os.environ.get("GLOO_CLIENT_ID")
GLOO_CLIENT_SECRET = os.environ.get("GLOO_CLIENT_SECRET")

YVP_BASE_URL = "https://api.youversion.com/v1"
GLOO_TOKEN_URL = "https://platform.ai.gloo.com/oauth2/token"
GLOO_RESPONSES_URL = "https://platform.ai.gloo.com/ai/v1/responses"

# Confirmed working for this app key (see scripts/probe_youversion.py):
# CUV is not licensed for API access, so CSBS (Chinese Standard Bible,
# Simplified) stands in as the real, published, non-AI-generated Chinese
# text. NIV is not licensed for this key either, so BSB (Berean Standard
# Bible) stands in as the real, published English text.
CHINESE_VERSION_ID = 43   # CSBS
ENGLISH_VERSION_ID = 3034  # BSB

# Curated languages offered in both the primary (top pane) and compare
# (bottom pane) pickers -- either can hold any of these, so a learner whose
# primary language is English and secondary is Mandarin works the same way
# as the default Mandarin-primary/English-secondary pairing. Each is a real
# ISO 639-3 code confirmed (scripts/probe_youversion.py) to have at least
# one version actually licensed and fetchable for this app key -- not just
# present in the wider discovery catalog (see CHINESE/ENGLISH_VERSION_ID
# comment above for why "discoverable" isn't the same as "usable").
COMPARE_LANGUAGES = [
    {"code": "zho", "label": "Chinese"},
    {"code": "eng", "label": "English"},
    {"code": "jpn", "label": "Japanese"},
    {"code": "spa", "label": "Spanish"},
    {"code": "fra", "label": "French"},
]

_gloo_token = None
_gloo_token_expires_at = 0


def get_passage(version_id, reference, fmt="text"):
    """Fetch a Bible passage. reference is USFM, e.g. 'JHN.3.16' or 'EPH.2'."""
    resp = requests.get(
        f"{YVP_BASE_URL}/bibles/{version_id}/passages/{reference}",
        headers={"X-YVP-App-Key": YVP_APP_KEY},
        params={"format": fmt},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()  # {"id", "content", "reference"}


class _ChapterHTMLParser(HTMLParser):
    """Parses YouVersion's format=html chapter markup into real paragraphs.

    The markup looks like:
      <div><div class="p">
        <span class="yv-v" v="1"></span><span class="yv-vlbl">1</span>text...
        <span class="yv-v" v="2"></span><span class="yv-vlbl">2</span>text...
      </div><div class="p"> ... next paragraph ... </div></div>

    div.p marks a real paragraph break (as the translation actually printed
    it -- verses 1-10 might be one paragraph, 11 the start of the next);
    yv-v marks where a verse starts (its "v" attribute is the verse number);
    yv-vlbl is just the human-visible number label repeated as text, which
    isn't part of the verse's actual content and gets skipped. Other inline
    spans (e.g. "nd" for small-caps, "pn" for proper nouns) are stylistic
    only -- their text is kept as part of the verse.
    """

    def __init__(self):
        super().__init__()
        self.paragraphs = []
        self._current_verse = None
        self._skip_data = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get("class", "").split()
        if tag == "div" and "p" in classes:
            self.paragraphs.append([])
        elif tag == "span" and "yv-v" in classes and "v" in attrs:
            verse = {"number": int(attrs["v"]), "text": ""}
            if self.paragraphs:
                self.paragraphs[-1].append(verse)
            self._current_verse = verse
        elif tag == "span" and "yv-vlbl" in classes:
            self._skip_data = True

    def handle_endtag(self, tag):
        if tag == "span":
            self._skip_data = False

    def handle_data(self, data):
        if self._skip_data:
            return
        if self._current_verse is not None:
            self._current_verse["text"] += data


_chapter_cache = {}


def get_chapter(version_id, book, chapter):
    """Fetch a full chapter as real paragraphs of real verses.

    One API call (format=html), parsed for actual paragraph breaks and verse
    boundaries -- rather than one call per verse. Cached since Bible text for
    a given version/chapter never changes.
    """
    cache_key = (version_id, book, chapter)
    if cache_key in _chapter_cache:
        return _chapter_cache[cache_key]

    passage = get_passage(version_id, f"{book}.{chapter}", fmt="html")
    parser = _ChapterHTMLParser()
    parser.feed(passage["content"])
    for paragraph in parser.paragraphs:
        for verse in paragraph:
            verse["text"] = verse["text"].strip()

    result = {"reference": passage["reference"], "paragraphs": parser.paragraphs}
    _chapter_cache[cache_key] = result
    return result


_versions_by_language_cache = {}


def list_versions(language_code):
    """List Bible versions actually licensed for this app key in a language.

    Deliberately omits all_available=true: that flag surfaces YouVersion's
    full discovery catalog, including versions this app key isn't licensed
    to fetch passages from (they 403). This only returns versions real
    enough to actually display.
    """
    if language_code in _versions_by_language_cache:
        return _versions_by_language_cache[language_code]
    resp = requests.get(
        f"{YVP_BASE_URL}/bibles",
        headers={"X-YVP-App-Key": YVP_APP_KEY},
        params={"language_ranges[]": language_code},
        timeout=15,
    )
    resp.raise_for_status()
    versions = []
    if resp.status_code == 200 and resp.text.strip():
        for v in resp.json().get("data", []):
            versions.append(
                {
                    "id": v.get("id"),
                    "abbreviation": v.get("localized_abbreviation") or v.get("abbreviation"),
                    "title": v.get("localized_title") or v.get("title"),
                }
            )
    _versions_by_language_cache[language_code] = versions
    return versions


_version_meta_cache = {}


def get_version_meta(version_id):
    """Fetch version metadata (abbreviation, title, copyright notice)."""
    if version_id in _version_meta_cache:
        return _version_meta_cache[version_id]
    resp = requests.get(
        f"{YVP_BASE_URL}/bibles/{version_id}",
        headers={"X-YVP-App-Key": YVP_APP_KEY},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    meta = {
        "abbreviation": data.get("localized_abbreviation") or data.get("abbreviation"),
        "title": data.get("localized_title") or data.get("title"),
        "copyright": data.get("copyright"),
        "language_tag": data.get("language_tag"),
    }
    _version_meta_cache[version_id] = meta
    return meta


def to_pinyin(chinese_text):
    """Pair each non-punctuation character with its tone-marked pinyin syllable."""
    syllables = pinyin(chinese_text, style=Style.TONE, errors="ignore")
    result = []
    i = 0
    for ch in chinese_text:
        if ch.strip() == "" or not _is_chinese_char(ch):
            result.append({"char": ch, "pinyin": None})
        else:
            syll = syllables[i][0] if i < len(syllables) else ""
            result.append({"char": ch, "pinyin": syll})
            i += 1
    return result


def _is_chinese_char(ch):
    return "一" <= ch <= "鿿"


def to_furigana(japanese_text):
    """Pair each kanji run with its hiragana reading (furigana), same {char,
    pinyin} shape as to_pinyin so the frontend's ruby-text renderer works
    unchanged for both languages. Tokens that are already kana/punctuation
    (no kanji) get pinyin=None, since furigana is never shown over them.
    """
    result = []
    for token in _kks.convert(japanese_text):
        orig = token["orig"]
        reading = token["hira"]
        result.append({"char": orig, "pinyin": reading if reading != orig else None})
    return result


def plain_chars(text):
    """Same {char, pinyin} shape as to_pinyin/to_furigana but with no
    reading annotation -- lets the frontend's ruby renderer handle every
    language uniformly even when that language has no ruby convention.
    """
    return [{"char": ch, "pinyin": None} for ch in text]


def annotate_reading(text, language_tag):
    """Ruby-text reading aid for whichever language is showing, or plain
    (unannotated) characters if the language has no such convention (e.g.
    English/Spanish/French) -- same dispatch whether the language ends up
    in the primary pane or the compare pane, since either can hold any
    language now.
    """
    if language_tag in ("zh", "zho", "cmn"):
        return to_pinyin(text)
    if language_tag == "ja":
        return to_furigana(text)
    return plain_chars(text)


def _get_gloo_token():
    global _gloo_token, _gloo_token_expires_at
    if _gloo_token and time.time() < _gloo_token_expires_at - 30:
        return _gloo_token

    resp = requests.post(
        GLOO_TOKEN_URL,
        auth=(GLOO_CLIENT_ID, GLOO_CLIENT_SECRET),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={"grant_type": "client_credentials", "scope": "api/access"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    _gloo_token = data["access_token"]
    _gloo_token_expires_at = time.time() + data.get("expires_in", 3600)
    return _gloo_token


_LANGUAGE_NAMES = {
    "zh": "Mandarin Chinese",
    "ja": "Japanese",
    "en": "English",
    "es": "Spanish",
    "fr": "French",
}


def explain_word(word, verse_text, language_tag=None):
    """Ask Gloo to explain a word/phrase in plain language, grounded in the
    verse -- in whatever language the word itself is in (immersion, same as
    the reading aid), not always English/Mandarin. Any word in any verse can
    reach this now (the frontend segments words client-side), so the prompt
    can no longer assume Mandarin.
    """
    language_name = _LANGUAGE_NAMES.get(language_tag)
    learning_clause = f"learning {language_name}" if language_name else "learning this language"
    response_clause = f"Respond entirely in {language_name}." if language_name else "Respond in the same language as the verse."

    token = _get_gloo_token()
    resp = requests.post(
        GLOO_RESPONSES_URL,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        json={
            "model": "gloo-openai-gpt-5-mini",
            "instructions": (
                "You are a gentle language-and-faith companion helping someone "
                f"{learning_clause} understand a single word or short phrase "
                "from a Bible verse they are reading. Explain its meaning in "
                "plain, encouraging language, grounded in how it is used in "
                "this specific verse -- not a dictionary definition. Keep it "
                f"to 2-4 short sentences. {response_clause}"
            ),
            "input": [
                {
                    "role": "user",
                    "content": f'Verse: "{verse_text}"\n\nExplain the word "{word}" as it is used in this verse.',
                }
            ],
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    for item in data.get("output", []):
        if item.get("type") == "message":
            for block in item.get("content", []):
                if block.get("type") == "output_text":
                    return block["text"]
    return "(no explanation returned)"
