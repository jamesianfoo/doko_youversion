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
    COMPARE_LANGUAGES,
    ENGLISH_VERSION_ID,
    explain_word,
    get_chapter,
    get_passage,
    get_version_meta,
    list_versions,
    to_furigana,
    to_pinyin,
)

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")

MEMORY_PATH = os.path.join(os.path.dirname(__file__), "memory.json")

# MVP scope: one curated demo chapter, with one verse in it tappable. Real
# text for every verse is fetched live from the API every time -- only the
# reference + which word(s) are tappable are hardcoded, because Chinese word
# segmentation is out of scope for this MVP.
DEMO_VERSE = {"usfm": "EPH.2.8", "tappable_words": ["恩典"]}
DEMO_CHAPTER = {"book": "EPH", "chapter": 2, "verse_count": 22, "tappable_verse_number": 8}


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
    chapter = get_chapter(
        CHINESE_VERSION_ID, DEMO_CHAPTER["book"], DEMO_CHAPTER["chapter"], DEMO_CHAPTER["verse_count"]
    )
    meta = get_version_meta(CHINESE_VERSION_ID)

    verses = []
    full_text_parts = []
    for v in chapter["verses"]:
        tappable = []
        if v["number"] == DEMO_CHAPTER["tappable_verse_number"]:
            tappable = _find_tappable_spans(v["text"], DEMO_VERSE["tappable_words"])
        verses.append(
            {
                "number": v["number"],
                "chars": to_pinyin(v["text"]),
                "raw_text": v["text"],
                "tappable": tappable,
            }
        )
        full_text_parts.append(v["text"])

    return jsonify(
        {
            "reference": chapter["reference"],
            "verses": verses,
            "raw_text": " ".join(full_text_parts),
            "version": meta,
        }
    )


@app.route("/api/compare/languages")
def api_compare_languages():
    return jsonify({"languages": COMPARE_LANGUAGES, "default_version_id": ENGLISH_VERSION_ID})


@app.route("/api/compare/versions")
def api_compare_versions():
    language = request.args.get("language")
    if not language:
        return jsonify({"error": "language query param required"}), 400
    return jsonify({"versions": list_versions(language)})


@app.route("/api/compare/passage")
def api_compare_passage():
    version_id = request.args.get("version_id", type=int)
    if not version_id:
        return jsonify({"error": "version_id query param required"}), 400
    passage = get_passage(version_id, DEMO_VERSE["usfm"])
    meta = get_version_meta(version_id)
    response = {
        "reference": passage["reference"],
        "text": passage["content"],
        "version": meta,
    }
    # Furigana is the Japanese equivalent of the verse's pinyin ruby text --
    # only worth computing for Japanese, so other languages get plain text.
    if meta.get("language_tag") == "ja":
        response["chars"] = to_furigana(passage["content"])
    return jsonify(response)


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

    return jsonify(
        {
            "word": word,
            "explanation": explanation,
            "explanation_chars": to_pinyin(explanation),
        }
    )


@app.route("/api/memory")
def api_memory():
    entries = _load_memory()
    return jsonify({"entries": entries[-10:]})


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5000)))
