"""
Day 1 de-risking probe: confirm we can list Bible versions and fetch a
passage from the YouVersion Platform API.

Usage:
    python3 scripts/probe_youversion.py

Requires YVP_APP_KEY in .env (see .env.example).
"""
import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv()

APP_KEY = os.environ.get("YVP_APP_KEY")
BASE_URL = "https://api.youversion.com/v1"


def require_key():
    if not APP_KEY:
        sys.exit("Missing YVP_APP_KEY. Copy .env.example to .env and fill it in.")


def list_versions(language_code):
    """List all Bible versions available for a given ISO 639-3 language code."""
    resp = requests.get(
        f"{BASE_URL}/bibles",
        headers={"X-YVP-App-Key": APP_KEY},
        params={"language_ranges[]": language_code, "all_available": "true"},
        timeout=15,
    )
    print(f"\nGET /bibles?language_ranges[]={language_code}&all_available=true")
    print("status:", resp.status_code)
    if resp.ok:
        data = resp.json()
        versions = data.get("data", data if isinstance(data, list) else [])
        for v in versions:
            print(f"  id={v.get('id')}  abbr={v.get('abbreviation')}  title={v.get('title')}")
        return versions
    else:
        print("  body:", resp.text[:500])
        return []


def get_passage(version_id, reference, fmt="text"):
    resp = requests.get(
        f"{BASE_URL}/bibles/{version_id}/passages/{reference}",
        headers={"X-YVP-App-Key": APP_KEY},
        params={"format": fmt},
        timeout=15,
    )
    print(f"\nGET /bibles/{version_id}/passages/{reference}?format={fmt}")
    print("status:", resp.status_code)
    print("body:", resp.text[:1000])
    return resp


if __name__ == "__main__":
    require_key()

    print("=== Looking for Chinese versions (try zho, then cmn) ===")
    zh_versions = list_versions("zho") or list_versions("cmn")

    print("\n=== Looking for English versions (find NIV) ===")
    en_versions = list_versions("eng")

    print("\n=== Checking for a native Pinyin version (try pny) ===")
    list_versions("pny")

    print("\n=== Known-good sanity check: John 3:16 on a documented version id ===")
    get_passage(3034, "JHN.3.16")

    print(
        "\nNext: once you see real version ids above for a Chinese version "
        "(CUV/CUNP) and NIV, hardcode them and re-run get_passage() to confirm "
        "actual verse text comes back."
    )
