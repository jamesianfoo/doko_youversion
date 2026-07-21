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
    annotate_reading,
    explain_word,
    get_chapter,
    get_passage,
    get_version_meta,
    list_versions,
)

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")

MEMORY_PATH = os.path.join(os.path.dirname(__file__), "memory.json")

# MVP scope: one curated demo chapter. Every word in every verse (and in the
# Compare pane) is tappable -- the frontend segments words client-side via
# Intl.Segmenter, which handles Chinese/Japanese word boundaries without any
# server-side NLP library, so there's no hardcoded word list here anymore.
DEMO_CHAPTER = {"book": "EPH", "chapter": 2, "tappable_verse_number": 8}


def _load_memory():
    if not os.path.exists(MEMORY_PATH):
        return []
    with open(MEMORY_PATH) as f:
        return json.load(f)


def _save_memory(entries):
    with open(MEMORY_PATH, "w") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)


@app.route("/api/verse")
def api_verse():
    # Primary pane defaults to the Mandarin demo chapter, but a learner whose
    # primary language is English (Mandarin as the "side-kick" secondary) can
    # point this at any licensed version via ?version_id=.
    version_id = request.args.get("version_id", type=int) or CHINESE_VERSION_ID
    chapter = get_chapter(version_id, DEMO_CHAPTER["book"], DEMO_CHAPTER["chapter"])
    meta = get_version_meta(version_id)

    paragraphs = []
    full_text_parts = []
    for para in chapter["paragraphs"]:
        verses = []
        for v in para:
            verses.append(
                {
                    "number": v["number"],
                    "chars": annotate_reading(v["text"], meta.get("language_tag")),
                    "raw_text": v["text"],
                    "is_featured": v["number"] == DEMO_CHAPTER["tappable_verse_number"],
                }
            )
            full_text_parts.append(v["text"])
        paragraphs.append(verses)

    return jsonify(
        {
            "version_id": version_id,
            "reference": chapter["reference"],
            "paragraphs": paragraphs,
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
    # Any verse in the chapter can be compared, not just the fixed demo verse
    # -- tapping a different verse in the primary pane re-targets this.
    verse_number = request.args.get("verse", type=int) or DEMO_CHAPTER["tappable_verse_number"]
    usfm = f"{DEMO_CHAPTER['book']}.{DEMO_CHAPTER['chapter']}.{verse_number}"
    passage = get_passage(version_id, usfm)
    meta = get_version_meta(version_id)
    return jsonify(
        {
            "reference": passage["reference"],
            "verse_number": verse_number,
            "text": passage["content"],
            "chars": annotate_reading(passage["content"], meta.get("language_tag")),
            "version": meta,
        }
    )


@app.route("/api/explain", methods=["POST"])
def api_explain():
    body = request.get_json(force=True)
    word = body["word"]
    verse_text = body["verse_text"]
    language_tag = body.get("language_tag")
    verse_ref = body.get("verse_ref", f"{DEMO_CHAPTER['book']}.{DEMO_CHAPTER['chapter']}")
    verse_number = body.get("verse_number")
    level = body.get("level", "native")
    skip_memory = body.get("skip_memory", False)

    explanation = explain_word(word, verse_text, language_tag, level)

    # Re-explaining the same word at a different depth isn't a new
    # exploration event -- only a genuine first lookup gets logged, so the
    # memory banner never ends up referencing the word currently on screen.
    if not skip_memory:
        entries = _load_memory()
        entries.append(
            {
                "word": word,
                "verse_ref": verse_ref,
                "verse_number": verse_number,
                "verse_text": verse_text,
                "language_tag": language_tag,
                "timestamp": time.time(),
            }
        )
        _save_memory(entries)

    return jsonify(
        {
            "word": word,
            "explanation": explanation,
            "explanation_chars": annotate_reading(explanation, language_tag),
        }
    )


@app.route("/api/memory")
def api_memory():
    entries = _load_memory()
    # Memory is scoped to whichever language is currently primary -- a word
    # tapped in Japanese showing up while Chinese is now primary is both
    # confusing to read and impossible to act on (no matching tappable span
    # exists in the current chapter render to jump back to).
    language_tag = request.args.get("language_tag")
    if language_tag:
        entries = [e for e in entries if e.get("language_tag") == language_tag]
    return jsonify({"entries": entries[-10:]})


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5000)))
