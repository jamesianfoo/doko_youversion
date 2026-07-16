"""
Shared API clients for Doko -- used by both the Flask app (app.py) and the
Kaggle notebook, so both demonstrate the exact same real API calls.
"""
import os
import time

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

# Curated languages offered in the "Compare" picker. Each is a real ISO
# 639-3 code confirmed (scripts/probe_youversion.py) to have at least one
# version actually licensed and fetchable for this app key -- not just
# present in the wider discovery catalog (see CHINESE/ENGLISH_VERSION_ID
# comment above for why "discoverable" isn't the same as "usable").
COMPARE_LANGUAGES = [
    {"code": "eng", "label": "English"},
    {"code": "jpn", "label": "Japanese"},
    {"code": "spa", "label": "Spanish"},
    {"code": "fra", "label": "French"},
]

_gloo_token = None
_gloo_token_expires_at = 0


def get_passage(version_id, reference):
    """Fetch plain-text Bible passage content. reference is USFM, e.g. 'JHN.3.16'."""
    resp = requests.get(
        f"{YVP_BASE_URL}/bibles/{version_id}/passages/{reference}",
        headers={"X-YVP-App-Key": YVP_APP_KEY},
        params={"format": "text"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()  # {"id", "content", "reference"}


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


def explain_word(word, verse_text):
    """Ask Gloo to explain a word/phrase in plain language, grounded in the verse."""
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
                "learning Mandarin understand a single word from a Bible verse "
                "they are reading. Explain the word's meaning in plain, "
                "encouraging language, grounded in how it is used in this "
                "specific verse -- not a dictionary definition. Keep it to "
                "2-4 short sentences."
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
