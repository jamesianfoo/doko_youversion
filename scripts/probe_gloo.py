"""
Day 1 de-risking probe: confirm we can authenticate with Gloo AI Studio and
get a plain-language, context-grounded explanation of a word.

Gloo uses OAuth2 client-credentials (NOT a single static API key) --
see .env.example for GLOO_CLIENT_ID / GLOO_CLIENT_SECRET.

Usage:
    python3 scripts/probe_gloo.py
"""
import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID = os.environ.get("GLOO_CLIENT_ID")
CLIENT_SECRET = os.environ.get("GLOO_CLIENT_SECRET")
TOKEN_URL = "https://platform.ai.gloo.com/oauth2/token"
RESPONSES_URL = "https://platform.ai.gloo.com/ai/v1/responses"


def require_creds():
    if not CLIENT_ID or not CLIENT_SECRET:
        sys.exit(
            "Missing GLOO_CLIENT_ID / GLOO_CLIENT_SECRET. Copy .env.example to "
            ".env and fill them in (check the Gloo AI Studio dashboard -- this "
            "API uses OAuth2 client credentials, not a single API key)."
        )


def get_access_token():
    resp = requests.post(
        TOKEN_URL,
        auth=(CLIENT_ID, CLIENT_SECRET),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={"grant_type": "client_credentials", "scope": "api/access"},
        timeout=15,
    )
    print("POST /oauth2/token")
    print("status:", resp.status_code)
    resp.raise_for_status()
    return resp.json()["access_token"]


def explain_word_in_context(word, verse_text, token):
    resp = requests.post(
        RESPONSES_URL,
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
                "specific verse -- not a dictionary definition."
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
    print("\nPOST /ai/v1/responses")
    print("status:", resp.status_code)
    print("body:", resp.text[:1500])
    return resp


if __name__ == "__main__":
    require_creds()
    token = get_access_token()
    explain_word_in_context(
        word="恩典 (grace)",
        verse_text="因为世人都犯了罪,亏缺了神的荣耀。惟有神的恩典,藉着基督耶稣的救赎,就白白地称义。",
        token=token,
    )
