# Dōkō (同行) — Walking Together Through Scripture

An AI Scripture companion for Mandarin and Japanese language learners.

*Dōkō* (同行) means "walking together."

---

My grandpa spoke only Mandarin. I learned Mandarin so I could stay close to him — often
with a translation app open in the middle of our conversations. He passed away last year.

Dōkō carries that forward for my church's Mandarin-speaking community: it helps someone
read Scripture in a language they are still learning, and it never puts a machine
translation of the Bible in front of them to do it.

Built for the YouVersion **Scripture in New Frontiers** hackathon.

## The rule this project is built around

The tempting shortcut here is to let an LLM translate or paraphrase Scripture. Dōkō never
does. AI is used for **explanation only** — never for source text, and never for factual
reference data.

| Layer | Source | AI involved? |
|---|---|---|
| Bible text | YouVersion Platform API — real licensed translations | **No** |
| Pinyin / furigana | `pypinyin`, `pykakasi` — deterministic libraries | **No** |
| Greek words, Strong's numbers, definitions | Bundled public-domain lexicon data | **No** |
| Word explanations | Gloo AI Studio | Yes |
| "Behind the translation" insight | Gloo AI Studio, grounded in the real Greek | Yes — prose only |

That last row is the one worth checking rather than trusting. The Greek data is loaded
server-side and passed into the prompt as grounding; the prompt forbids recalling Greek
from model memory; and the Kaggle notebook **verifies the output programmatically** —
every Greek word the model cites is matched against the real lexicon file.

## What it does

- **Read a chapter** in Mandarin or Japanese, with the publisher's own paragraph structure
  rather than one box per verse
- **Reading aid** — pinyin above Chinese, furigana above Japanese, toggleable off as
  fluency grows
- **Tap any word** in any language for a Gloo explanation grounded in that verse, written
  in the language being learned (immersion, not constant translation back to English)
- **Adjustable depth** — beginner ↔ native, independent of which language it is written in
- **Compare translations** side by side, any two licensed versions
- **Behind the translation** — what the original Greek adds to the verse, grounded in real
  Strong's data
- **Memory** — words you have looked up before resurface with Find and Definition

## Running it

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env               # then fill in your credentials
python app.py                      # http://127.0.0.1:5000
```

You need three credentials in `.env`:

```
YVP_APP_KEY=          # YouVersion Platform API
GLOO_CLIENT_ID=       # Gloo AI Studio (OAuth2 client credentials)
GLOO_CLIENT_SECRET=
```

`.env` is gitignored and has been since the first commit — no credential has ever been
committed to this repository.

## The Kaggle notebook

[`doko_kaggle_notebook.ipynb`](doko_kaggle_notebook.ipynb) demonstrates every real API call
this project makes, independently of the web UI. It imports the same `api_clients.py` the
app uses, so the calls shown there are the calls that actually run — not a parallel
reimplementation.

On Kaggle: enable **Internet** in the notebook settings, and add the three credentials
under **Add-ons → Secrets**. It clones this repository to get the shared client module.

## Layout

```
app.py                      Flask routes
api_clients.py              YouVersion + Gloo clients, reading annotation (shared with the notebook)
greek_data.py               Loads the bundled Strong's data
data/                       Real Greek word data for Ephesians 2 + sourcing notes
scripts/build_greek_data.py One-time data prep (not run by the app)
templates/index.html        Single-page UI
static/app.js               Frontend logic
static/style.css            Styling
doko_kaggle_notebook.ipynb  Kaggle submission notebook
```

## A note on the translations used

For this app key, CUV (Chinese Union Version) and NIV are not licensed for API access.
Rather than substitute an AI translation, Dōkō uses other genuinely licensed published
translations: **CSBS** (中文标准译本) for Chinese and **BSB** (Berean Standard Bible) for
English. Scripture text is always fetched live from YouVersion, never bundled or generated.

## Greek data sourcing

The Ephesians 2 Greek word data is derived from
[`tahmmee/interlinear_bibledata`](https://github.com/tahmmee/interlinear_bibledata), built
from the public-domain Strong's Concordance and a KJV interlinear New Testament. See
[`data/README.md`](data/README.md) for full sourcing, license, and generation details.

Ephesians is a New Testament letter, so this chapter is Koine Greek — there is no Hebrew in
this demo. The same upstream source has a Hebrew Old Testament dataset if Dōkō ever covers
an Old Testament chapter.

## Credits

- Scripture via the [YouVersion Platform API](https://developers.youversion.com)
- Explanations via [Gloo AI Studio](https://www.gloo.com)
- Pinyin via [`pypinyin`](https://github.com/mozillazg/python-pinyin), furigana via
  [`pykakasi`](https://github.com/miurahr/pykakasi)
