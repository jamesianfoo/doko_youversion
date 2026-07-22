# Dōkō (同行) — Walking Together Through Scripture and Language

My church has a growing Chinese community. I decided to learn Mandarin to connect with them, and I opened YouVersion — an app I've used since launch and one of the primary tools in my walk with Jesus — expecting it to help.

It didn't. There's no pronunciation guide for Chinese characters. Comparing translations means leaving the passage entirely. This isn't a niche complaint — a rival Chinese Bible app has had users requesting pinyin since 2018 and still hasn't shipped it. If a category leader hasn't solved this in years, the gap is real, not imagined.

Dōkō (同行 — "walking together") closes it. Not another Bible app — a companion that sits inside the passage and helps someone grow in faith and language at the same time, one word at a time. The name is the same character in Chinese (Tóngxíng), Japanese (Dōkō), and Korean (Donghaeng): a companion on the road. Chinese and Japanese both work today; the architecture is language-agnostic.


The obvious shortcut in a hackathon like this is to let an LLM translate or paraphrase Scripture. Dōkō never does — not once.

Every word of Scripture comes from a real, licensed YouVersion translation. AI is used for **explanation only**: never for source text, and never for factual reference data. When Dōkō shows the original Greek behind a verse, those words, their Strong's numbers, and their lexical definitions come from public-domain lexicon data — not from a model. Language models hallucinate plausible-but-wrong Strong's numbers and roots, and anyone who actually reads Greek would catch it immediately.

The accompanying notebook doesn't just assert this. Its final cell extracts every Greek word the AI cited in its prose, matches each one against the source data file, and prints pass or fail.

## How it works

**Read a full chapter** in Chinese or Japanese, with the publisher's own paragraph structure — pinyin above the characters, furigana above the kanji. As your reading improves, turn the reading aid off with one tap.

**Tap any word** — 恩典, *grace* — and Gloo AI Studio explains it in the context of that verse, not as a dictionary lookup, and writes the explanation *in the language you're learning*. Immersion, rather than constant translation back to English. Set the depth to beginner or native depending on where you are.

**Compare translations** side by side without leaving the passage. And beneath the English text, *Behind the translation* shows what the original Greek adds to the verse — grounded in real Strong's data, and written as insight rather than a lexicon dump.

**The companion remembers.** A word you looked up resurfaces later, with Find and Definition. This isn't a one-off reading session; it's a relationship with both the language and the Word that compounds over time.

## Why this matters

This is Scripture showing up in a frontier nobody has named yet: the quiet work of learning a family's — or a community's — language as an adult. It's the same mission YouVersion has always had, Scripture in the language people actually speak, built for the AI era and built without ever letting the AI touch the Scripture itself.

## Technical approach

Built on both required APIs. The **YouVersion Platform API** supplies all Scripture text and multi-version access; requests use `format=html` so the publisher's real paragraph and verse structure survives into the reader rather than collapsing into one box per verse. **Gloo AI Studio** (OAuth2 client credentials → Responses API) handles word explanations and the grounded Greek insight.

Reading aids are deterministic libraries, not models: `pypinyin` for Mandarin pinyin, `pykakasi` for Japanese furigana. Word segmentation uses the browser's native `Intl.Segmenter`, so any word in any language becomes tappable with no server-side NLP dependency. Pronunciation playback uses on-device speech synthesis — pronunciation practice for a learner, distinct from a recorded audio Bible.

A note on the translations used: for this app key, CUV and NIV are not licensed for API access. Rather than substitute an AI translation — the exact shortcut this project refuses — Dōkō uses other genuinely licensed published translations: **CSBS** (中文标准译本) for Chinese and **BSB** (Berean Standard Bible) for English.

The backend is Flask. `api_clients.py` is shared by both the web app and the Kaggle notebook, so the notebook demonstrates the calls that actually run in the app rather than a parallel reimplementation.

**Code:** https://github.com/jamesianfoo/doko_youversion

## The story

My grandpa was a native Mandarin speaker who never learned English, and a man who followed God every day of his life. Getting close to him meant learning his language — slow, constant work in an English-speaking country, often with a translation app open just to have a real conversation with him. He passed last year. Dōkō is how I keep walking that road — not just for him, but for my church's growing Mandarin-speaking community now.
