# Dōkō (同行) — Walking Together Through Scripture and Language

Here is a digital space Scripture has never reached, and one not on anyone's list. Millions of adults are learning a language to reach their own family or community, and nothing bridges the gap between reading Scripture in it and understanding it.

My church has a growing Chinese community. I learned Mandarin to connect with them and opened YouVersion expecting help. There is no pronunciation guide for Chinese characters. Comparing translations means leaving the passage. A rival Chinese Bible app has had pinyin requests since 2018 and still hasn't shipped it.

Dōkō (同行 — "walking together") is a companion that lives inside the passage, growing faith and language at the same time. The same character reads Tóngxíng in Chinese, Dōkō in Japanese, Donghaeng in Korean.

The shortcut here is letting an LLM translate Scripture. Dōkō never does.

Every word comes from a licensed YouVersion translation. AI explains only — never source text, never factual data. The Greek shown behind each verse comes from public-domain Strong's lexicon data, not a model, because LLMs hallucinate Strong's numbers and any Greek reader would catch it. The notebook's final cell proves this rather than claiming it: it extracts every Greek word the AI cited and matches each against the source file.

## How it works

Read a chapter in Chinese or Japanese with the publisher's real paragraph structure — pinyin above the characters, furigana above the kanji, switched off with one tap as fluency grows.

Tap any word. Gloo AI Studio explains it in that verse's context, written in the language you're learning — immersion, not translation back to English. Choose beginner or native depth.

Compare translations without leaving the passage. Beneath the English, *Behind the translation* shows what the Greek adds — grounded in real lexicon data, written as insight rather than a word dump.

It remembers. Words resurface later, so reading compounds rather than resets.

## Technical approach

The YouVersion Platform API supplies all Scripture, requested as HTML so publisher paragraph structure survives. Gloo AI Studio (OAuth2 → Responses API) handles explanations and the grounded Greek insight.

Reading aids are deterministic libraries, not models: `pypinyin` and `pykakasi`. Segmentation uses the browser's native `Intl.Segmenter`, making any word tappable with no server-side NLP. Audio uses on-device speech synthesis for pronunciation practice.

CUV and NIV aren't licensed for this key. Rather than substitute an AI translation — the shortcut this refuses — Dōkō uses CSBS and BSB.

`api_clients.py` is shared by app and notebook, so the notebook runs the code that ships.

## The story

My grandpa never learned English, and followed God every day of his life. Getting close to him meant learning his language — often with a translation app open just to talk. He passed last year. Dōkō is how I keep walking that road, now for my church's Mandarin-speaking community.
