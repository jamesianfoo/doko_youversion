"""
Shared API clients for Doko -- used by both the Flask app (app.py) and the
Kaggle notebook, so both demonstrate the exact same real API calls.
"""
import os
import time

import requests
from dotenv import load_dotenv
from pypinyin import pinyin, Style

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
