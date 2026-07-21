"""
One-time data-prep script: builds data/greek_ephesians_2.json.

NOT run as part of the app -- this was run once against two public-domain
source files that aren't checked into this repo (they're much larger than
what we actually need):

1. bibledata/ephesians.json -- from the "interlinear" folder of
   github.com/tahmmee/interlinear_bibledata (public domain per that repo's
   README), extracted from interlinear/bible.tar.gz. Per-verse Greek words
   in their real word order (the "i" field), each tagged with a Strong's
   number and a KJV English gloss.
2. greek.json -- from the same repo's lexicon/greek.json.gz. Strong's
   number -> short/long lexical definition + the KJV's full range of
   English renderings for that word.

Transliteration isn't in either source, so it's generated here
deterministically (a fixed Greek -> Latin letter/digraph mapping, including
rough-breathing detection) -- not looked up or AI-generated, since a wrong
transliteration would be an easy, embarrassing thing for anyone who reads
Greek to catch.

Re-run only if extending to another chapter: download both source files
above, place them next to this script, and adjust the "49002" (book 49 =
Ephesians, chapter 002) filter below.
"""
import json
import unicodedata

GREEK_MAP = {
    "α": "a", "β": "b", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "ē",
    "θ": "th", "ι": "i", "κ": "k", "λ": "l", "μ": "m", "ν": "n", "ξ": "x",
    "ο": "o", "π": "p", "ρ": "r", "σ": "s", "ς": "s", "τ": "t", "υ": "u",
    "φ": "ph", "χ": "ch", "ψ": "ps", "ω": "ō",
}
DIGRAPHS = {
    ("ο", "υ"): "ou", ("α", "ι"): "ai", ("ε", "ι"): "ei", ("ο", "ι"): "oi",
    ("υ", "ι"): "ui", ("α", "υ"): "au", ("ε", "υ"): "eu", ("η", "υ"): "ēu",
}
ROUGH_BREATHING = "̔"  # combining reversed comma above (dasia)


def _decompose_letters(greek_word):
    """Returns list of (lowercase_base_letter, has_rough_breathing) for each
    Greek base letter in the word, accents stripped."""
    decomposed = unicodedata.normalize("NFD", greek_word)
    letters = []
    i, n = 0, len(decomposed)
    while i < n:
        ch = decomposed[i].lower()
        if ch not in GREEK_MAP:
            i += 1
            continue
        j = i + 1
        has_rough = False
        while j < n and unicodedata.combining(decomposed[j]):
            if decomposed[j] == ROUGH_BREATHING:
                has_rough = True
            j += 1
        letters.append((ch, has_rough))
        i = j
    return letters


def transliterate(greek_word):
    letters = _decompose_letters(greek_word)
    out = []
    i, n = 0, len(letters)
    while i < n:
        base, rough = letters[i]
        if i + 1 < n:
            nxt, _ = letters[i + 1]
            digraph = DIGRAPHS.get((base, nxt))
            if digraph:
                out.append(("h" if rough else "") + digraph)
                i += 2
                continue
        out.append(("h" if rough else "") + GREEK_MAP[base])
        i += 1
    result = "".join(out)
    return result[0].upper() + result[1:] if result else result


interlinear = json.load(open("bibledata/ephesians.json"))
lexicon_list = json.load(open("greek.json"))
lexicon = {e["strongs"]: e for e in lexicon_list}

chapter2 = [e for e in interlinear if e["id"].startswith("49002")]

verses = {}
for entry in chapter2:
    vnum = str(int(entry["id"][-3:]))
    words_sorted = sorted(entry["verse"], key=lambda w: w["i"])
    out_words = []
    for w in words_sorted:
        strongs = w["number"]
        lex = lexicon.get(strongs, {})
        short_def = lex.get("data", {}).get("def", {}).get("short", "")
        kjv_usage = lex.get("word", "")
        out_words.append({
            "greek": w["word"],
            "translit": transliterate(w["word"]),
            "strongs": strongs.upper(),
            "gloss": w["text"],
            "definition": short_def,
            "kjv_usage": kjv_usage,
        })
    verses[vnum] = out_words

with open("greek_ephesians_2.json", "w") as f:
    json.dump({"book": "Ephesians", "chapter": 2, "verses": verses}, f, ensure_ascii=False, indent=2)

print("done. verses:", len(verses))
for w in verses["8"]:
    print(w["greek"], "->", w["translit"], w["strongs"], w["gloss"])
