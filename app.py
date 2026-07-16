"""
Doko MVP backend. One demo verse, the full loop, real API calls only.
Run: .venv/bin/python app.py   then open http://127.0.0.1:5000
"""
import json
import os
import time

from flask import Flask, jsonify, render_template, request

from api_clients import (
    CHINESE_VERSION_ID,
    ENGLISH_VERSION_ID,
    explain_word,
    get_passage,
    get_version_meta,
    to_pinyin,
)

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")

MEMORY_PATH = os.path.join(os.path.dirname(__file__), "memory.json")

# MVP scope: one curated demo verse and its tappable word(s). Real text is
# fetched live from the API every time -- only the reference + which word(s)
# are tappable are hardcoded, because Chinese word segmentation is out of
# scope for this MVP.
DEMO_VERSE = {"usfm": "EPH.2.8", "tappable_words": ["恩典"]}


def _load_memory():
    if not os.path.exists(MEMORY_PATH):
        return []
    with open(MEMORY_PATH) as f:
        return json.load(f)


def _save_memory(entries):
    with open(MEMORY_PATH, "w") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)


def _find_tappable_spans(chinese_text, words):
    spans = []
    for word in words:
        idx = chinese_text.find(word)
        if idx != -1:
            spans.append({"word": word, "start": idx, "end": idx + len(word)})
    return spans


@app.route("/api/verse")
def api_verse():
    passage = get_passage(CHINESE_VERSION_ID, DEMO_VERSE["usfm"])
    meta = get_version_meta(CHINESE_VERSION_ID)
    chinese_text = passage["content"]
    chars = to_pinyin(chinese_text)
    tappable = _find_tappable_spans(chinese_text, DEMO_VERSE["tappable_words"])
    verse_number = DEMO_VERSE["usfm"].split(".")[-1]
    return jsonify(
        {
            "usfm": DEMO_VERSE["usfm"],
            "reference": passage["reference"],
            "verse_number": verse_number,
            "chars": chars,
            "tappable": tappable,
            "raw_text": chinese_text,
            "version": meta,
        }
    )


@app.route("/api/english")
def api_english():
    passage = get_passage(ENGLISH_VERSION_ID, DEMO_VERSE["usfm"])
    meta = get_version_meta(ENGLISH_VERSION_ID)
    return jsonify(
        {
            "reference": passage["reference"],
            "text": passage["content"],
            "version": meta,
        }
    )


@app.route("/api/explain", methods=["POST"])
def api_explain():
    body = request.get_json(force=True)
    word = body["word"]
    verse_text = body["verse_text"]

    explanation = explain_word(word, verse_text)

    entries = _load_memory()
    entries.append(
        {
            "word": word,
            "verse_ref": DEMO_VERSE["usfm"],
            "timestamp": time.time(),
        }
    )
    _save_memory(entries)

    return jsonify({"word": word, "explanation": explanation})


@app.route("/api/memory")
def api_memory():
    entries = _load_memory()
    return jsonify({"entries": entries[-10:]})


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5000)))
