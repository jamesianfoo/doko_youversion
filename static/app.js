let currentVerseText = "";
let currentExplanationText = "";
let currentExplanationLanguageTag = null;
// The word/verse currently open in the explanation sheet -- kept around so
// toggling Beginner/Native can re-fetch at the new depth without needing a
// fresh tap on the word itself.
let currentExplanationContext = null;
let currentExplanationLevel = "native";
let currentPrimaryVersionId = null;
let currentPrimaryLanguageTag = null;
let currentReference = "";
// The verse currently highlighted and shown in the Compare pane. Starts
// null (defaults to the chapter's is_featured verse on first render) but,
// once a user taps a different verse, persists across primary-language
// switches and compare-version changes -- it's "which verse", independent
// of which script/version happens to be displaying it.
let selectedVerseNumber = null;
let currentCompareVersionId = null;
let currentCompareLanguageTag = null;
let currentCompareText = "";
let currentCompareRef = "";

const SPEECH_LANG_MAP = { zh: "zh-CN", en: "en-US", ja: "ja-JP", es: "es-ES", fr: "fr-FR" };
// Matches app.py's DEMO_CHAPTER (book/chapter) -- used only to build a
// verse_ref string for the memory log, not for any actual API fetch.
const DEMO_CHAPTER_REF = "EPH.2";

async function loadVerse(versionId) {
  const url = versionId ? `/api/verse?version_id=${encodeURIComponent(versionId)}` : "/api/verse";
  const res = await fetch(url);
  const data = await res.json();
  currentVerseText = data.raw_text;
  currentPrimaryVersionId = data.version_id;
  currentPrimaryLanguageTag = data.version.language_tag;
  currentReference = data.reference;

  document.getElementById("verse-loading").classList.add("hidden");
  document.getElementById("reference-pill").textContent = data.reference;
  document.getElementById("version-pill").textContent = data.version.abbreviation;

  renderChapter(data.paragraphs);
  renderCopyright(data.version.copyright);
  loadMemory();

  document.getElementById("jump-to-verse-btn").classList.remove("hidden");
  // Land straight on the selected verse instead of chapter start -- it's
  // easy to lose among 22 verses otherwise. Deferred a couple frames so
  // the browser finishes laying out the freshly-inserted verses first;
  // calling scrollIntoView in the same tick as the DOM insert can compute
  // against stale (pre-layout) positions and land in the wrong place.
  requestAnimationFrame(() => requestAnimationFrame(() => scrollToSelectedVerse(false)));
}

// Renders real paragraphs (from the translation's own HTML structure, see
// api_clients._ChapterHTMLParser) as continuous flowing text -- each verse
// is an inline, individually tappable/selectable span within its paragraph,
// not a separate boxed block. Matches how the actual app reads.
function renderChapter(paragraphs) {
  const container = document.getElementById("verse-chapter");
  container.innerHTML = "";

  let defaultVerseNumber = null;
  for (const paragraph of paragraphs) {
    const p = document.createElement("p");
    p.className = "paragraph";

    paragraph.forEach((verse, i) => {
      const span = document.createElement("span");
      span.className = "verse-inline";
      span.id = `verse-${verse.number}`;
      span.addEventListener("click", () => onVerseSelect(verse.number));

      if (verse.is_featured) {
        defaultVerseNumber = verse.number;
      }

      const sup = document.createElement("sup");
      sup.className = "verse-number";
      sup.textContent = verse.number;
      span.appendChild(sup);

      renderTappableText(span, verse.chars, verse.raw_text, currentPrimaryLanguageTag, verse.number);
      p.appendChild(span);
      if (i < paragraph.length - 1) p.appendChild(document.createTextNode(" "));
    });

    container.appendChild(p);
  }

  // Re-rendering (e.g. switching primary language) rebuilds every span
  // fresh, so the highlight has to be re-applied to whichever verse is
  // selected -- only fall back to the chapter's default featured verse on
  // first load.
  if (selectedVerseNumber === null) {
    selectedVerseNumber = defaultVerseNumber;
  }
  const selectedEl = document.getElementById(`verse-${selectedVerseNumber}`);
  if (selectedEl) selectedEl.classList.add("verse-highlight");
}

function onVerseSelect(verseNumber) {
  // Tapping a word/verse also re-opens a closed Compare panel (from cache,
  // see showComparePassage), so this can't early-return just because the
  // verse didn't change -- only the highlight-move step is skippable.
  if (verseNumber !== selectedVerseNumber) {
    const prevEl = document.getElementById(`verse-${selectedVerseNumber}`);
    if (prevEl) prevEl.classList.remove("verse-highlight");

    selectedVerseNumber = verseNumber;
    const newEl = document.getElementById(`verse-${verseNumber}`);
    if (newEl) newEl.classList.add("verse-highlight");
  }

  if (currentCompareVersionId !== null) {
    showComparePassage(currentCompareVersionId, verseNumber);
  }
}

function scrollToSelectedVerse(flash) {
  if (selectedVerseNumber === null) return;
  const el = document.getElementById(`verse-${selectedVerseNumber}`);
  if (!el) return;
  // "smooth" behavior here has been unreliable (sometimes never completes),
  // so jump instantly and use the flash pulse for visual feedback instead.
  el.scrollIntoView({ block: "center", behavior: "auto" });
  if (flash) {
    el.classList.add("verse-flash");
    setTimeout(() => el.classList.remove("verse-flash"), 1200);
  }
}

// Splits `text` into word/non-word segments using the browser's built-in
// Unicode word-segmentation (handles Chinese/Japanese word boundaries with
// no spaces, and Latin-script words, with no server-side NLP library
// needed). Falls back to treating the whole string as one non-word segment
// on browsers without Intl.Segmenter (Safari <17, older Firefox) -- the
// verse just renders without tap-to-explain in that case, degrading
// gracefully rather than breaking.
function segmentWords(text, languageTag) {
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
    return [{ segment: text, isWordLike: false }];
  }
  const segmenter = new Intl.Segmenter(languageTag || "en", { granularity: "word" });
  return Array.from(segmenter.segment(text));
}

// Appends reading-annotated (pinyin/furigana/plain) characters into
// `container`, wrapping each word-like segment (per segmentWords) in a
// clickable element that looks up that exact word/phrase via Gloo, grounded
// in `verseText`. Any word in any verse works now, in any of the app's
// languages -- not just one hardcoded demo word.
function renderTappableText(container, chars, text, languageTag, verseNumber) {
  const segments = segmentWords(text, languageTag);
  let charIndex = 0;
  for (const seg of segments) {
    const segChars = chars.slice(charIndex, charIndex + seg.segment.length);
    if (seg.isWordLike) {
      const wrapper = document.createElement("span");
      wrapper.className = "tappable";
      wrapper.dataset.word = seg.segment;
      for (const charObj of segChars) {
        wrapper.appendChild(renderRuby(charObj));
      }
      wrapper.addEventListener("click", () => onWordTap(seg.segment, wrapper, text, languageTag, verseNumber));
      container.appendChild(wrapper);
    } else {
      for (const charObj of segChars) {
        container.appendChild(renderRuby(charObj));
      }
    }
    charIndex += seg.segment.length;
  }
}

function renderRuby(charObj) {
  if (!charObj.pinyin) {
    return document.createTextNode(charObj.char);
  }
  const ruby = document.createElement("ruby");
  ruby.appendChild(document.createTextNode(charObj.char));
  const rt = document.createElement("rt");
  rt.textContent = charObj.pinyin;
  ruby.appendChild(rt);
  return ruby;
}

// Renders a plain (non-tappable) run of reading-annotated characters into a
// container -- used for the word-explanation text and compare passages.
function renderRubyText(container, chars) {
  container.innerHTML = "";
  for (const charObj of chars) {
    container.appendChild(renderRuby(charObj));
  }
}

function renderCopyright(copyrightText) {
  document.getElementById("copyright-footer").textContent = copyrightText || "";
}

function speak(text, languageTag) {
  if (!text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = SPEECH_LANG_MAP[languageTag] || languageTag || "en-US";
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

async function onWordTap(word, wrapperEl, verseText, languageTag, verseNumber) {
  document.querySelectorAll(".tappable").forEach((el) => el.classList.remove("active"));
  if (wrapperEl) wrapperEl.classList.add("active");

  currentExplanationContext = { word, verseText, languageTag, verseNumber };
  currentExplanationLanguageTag = languageTag;
  const sheet = document.getElementById("explanation-sheet");
  sheet.classList.remove("hidden");
  document.getElementById("explanation-word").textContent = word;

  await fetchExplanation({ skipMemory: false });
}

// Fetches (or re-fetches) the explanation for whatever's in
// currentExplanationContext, at currentExplanationLevel. Shared by a fresh
// word tap and by toggling Beginner/Native on the word already open --
// skipMemory is true for the latter, since re-explaining the same word at a
// different depth isn't a new exploration event.
async function fetchExplanation({ skipMemory }) {
  const ctx = currentExplanationContext;
  document.getElementById("explanation-text").textContent = "Thinking…";

  const res = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      word: ctx.word,
      verse_text: ctx.verseText,
      language_tag: ctx.languageTag,
      verse_ref: `${DEMO_CHAPTER_REF}.${ctx.verseNumber}`,
      verse_number: ctx.verseNumber,
      level: currentExplanationLevel,
      skip_memory: skipMemory,
    }),
  });
  const data = await res.json();
  currentExplanationText = data.explanation;
  renderRubyText(document.getElementById("explanation-text"), data.explanation_chars);

  if (!skipMemory) {
    // Refresh the memory banner now that this tap is part of the history --
    // it was previously only loaded once per page/language load, so it kept
    // showing the same word no matter how many new words got tapped after.
    loadMemory();
  }
}

function onLevelToggle(level) {
  if (level === currentExplanationLevel || !currentExplanationContext) return;
  currentExplanationLevel = level;
  document.querySelectorAll(".level-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.level === level);
  });
  fetchExplanation({ skipMemory: true });
}

function closeSheet() {
  document.getElementById("explanation-sheet").classList.add("hidden");
}

// The memory entry currently shown in the banner -- kept around so clicking
// it can replay the exact same lookup (right verse, right language).
let memoryBannerEntry = null;

async function loadMemory() {
  const res = await fetch(`/api/memory?language_tag=${encodeURIComponent(currentPrimaryLanguageTag)}`);
  const data = await res.json();
  const priorTaps = data.entries.filter((e) => e.word !== undefined);
  const banner = document.getElementById("memory-banner");

  if (priorTaps.length > 1) {
    memoryBannerEntry = priorTaps[priorTaps.length - 2];
    document.getElementById("memory-word").textContent = memoryBannerEntry.word;
    banner.classList.remove("hidden");
  } else {
    // Nothing explored yet in *this* language -- don't show a leftover
    // banner from before a primary-language switch.
    memoryBannerEntry = null;
    banner.classList.add("hidden");
  }
}

function findMemoryWrapperEl(entry) {
  return document.querySelector(`#verse-${entry.verse_number} .tappable[data-word="${CSS.escape(entry.word)}"]`);
}

// "Find": jump to the word without opening its explanation -- the verse
// highlight alone can be hard to spot the exact word within (several words
// share that same background tint), so this also flashes the word's own
// span specifically.
function onMemoryFindClick() {
  if (!memoryBannerEntry) return;
  const entry = memoryBannerEntry;
  onVerseSelect(entry.verse_number);
  scrollToSelectedVerse(true);
  const wrapperEl = findMemoryWrapperEl(entry);
  if (wrapperEl) {
    wrapperEl.classList.add("verse-flash");
    setTimeout(() => wrapperEl.classList.remove("verse-flash"), 1200);
  }
}

// "Definition": full replay, including a fresh Gloo call in the
// explanation sheet (same as tapping the word itself).
async function onMemoryDefinitionClick() {
  if (!memoryBannerEntry) return;
  const entry = memoryBannerEntry;
  onVerseSelect(entry.verse_number);
  scrollToSelectedVerse(true);
  const wrapperEl = findMemoryWrapperEl(entry);
  await onWordTap(entry.word, wrapperEl, entry.verse_text, entry.language_tag, entry.verse_number);
}

document.getElementById("memory-find-btn").addEventListener("click", onMemoryFindClick);
document.getElementById("memory-definition-btn").addEventListener("click", onMemoryDefinitionClick);

let showReadingAid = true;

function toggleReadingAid() {
  showReadingAid = !showReadingAid;
  document.body.classList.toggle("reading-aid-hidden", !showReadingAid);
  const btn = document.getElementById("ruby-toggle-btn");
  btn.classList.toggle("active", showReadingAid);
  btn.title = showReadingAid ? "Hide Pinyin & Furigana" : "Show Pinyin & Furigana";
}

document.getElementById("ruby-toggle-btn").addEventListener("click", toggleReadingAid);

document.getElementById("play-audio-btn").addEventListener("click", () => {
  document.getElementById("audio-player-bar").classList.toggle("hidden");
});

document.getElementById("audio-play-btn").addEventListener("click", () => {
  speak(currentVerseText, currentPrimaryLanguageTag);
});

document.getElementById("play-explanation-audio-btn").addEventListener("click", () => {
  // Speaks in whichever language the tapped word itself was in, not
  // necessarily the primary pane's current language (e.g. tapping a word in
  // the Compare pane while primary is Chinese).
  speak(currentExplanationText, currentExplanationLanguageTag);
});

document.getElementById("close-sheet-btn").addEventListener("click", closeSheet);
document.querySelector("#explanation-sheet .sheet-backdrop").addEventListener("click", closeSheet);

document.querySelectorAll(".level-btn").forEach((btn) => {
  btn.addEventListener("click", () => onLevelToggle(btn.dataset.level));
});

// --- Shared row renderers for both the primary-language and compare
// pickers -- same list UI (language list -> version list), just wired to
// different onSelect callbacks and different target containers.
let languagesResponseCache = null;

async function getLanguagesResponse() {
  if (!languagesResponseCache) {
    const res = await fetch("/api/compare/languages");
    languagesResponseCache = await res.json();
  }
  return languagesResponseCache;
}

async function getLanguages() {
  return (await getLanguagesResponse()).languages;
}

function renderLanguageRows(containerEl, languages, onSelect) {
  containerEl.innerHTML = "";
  for (const lang of languages) {
    const row = document.createElement("button");
    row.className = "picker-row";
    row.innerHTML = `
      <span class="picker-row-body"><span class="picker-row-title">${lang.label}</span></span>
      <span class="picker-chevron">›</span>
    `;
    row.addEventListener("click", () => onSelect(lang));
    containerEl.appendChild(row);
  }
}

function renderVersionRows(containerEl, versions, onSelect) {
  containerEl.innerHTML = "";
  for (const v of versions) {
    const row = document.createElement("button");
    row.className = "picker-row";
    row.innerHTML = `
      <span class="picker-badge">${v.abbreviation}</span>
      <span class="picker-row-body"><span class="picker-row-title">${v.title}</span></span>
      <span class="picker-chevron">›</span>
    `;
    row.addEventListener("click", () => onSelect(v));
    containerEl.appendChild(row);
  }
}

// --- Compare pane (secondary language): a persistent bottom pane, not a
// modal, so it never blocks clicks to the top pane. Three states:
// 'language', 'version', 'result'.
function showCompareState(state, headerTitle) {
  document.getElementById("compare-language-list").classList.toggle("hidden", state !== "language");
  document.getElementById("compare-version-list").classList.toggle("hidden", state !== "version");
  document.getElementById("compare-result").classList.toggle("hidden", state !== "result");
  document.getElementById("compare-back-btn").classList.toggle("hidden", state !== "version");
  document.getElementById("compare-change-btn").classList.toggle("hidden", state !== "result");
  document.getElementById("compare-header-title").textContent =
    headerTitle || (state === "version" ? "Choose a version" : `Compare ${currentReference}`);
}

async function openLanguagePicker() {
  showCompareState("language");
  const languages = await getLanguages();
  renderLanguageRows(document.getElementById("compare-language-list"), languages, onLanguageRowClick);
}

async function onLanguageRowClick(lang) {
  showCompareState("version", lang.label);
  const list = document.getElementById("compare-version-list");
  list.innerHTML = `<p class="picker-row-subtitle">Loading…</p>`;
  const res = await fetch(`/api/compare/versions?language=${encodeURIComponent(lang.code)}`);
  const data = await res.json();
  renderVersionRows(list, data.versions, (v) => showComparePassage(v.id));
}

// Cached by "<versionId>_<verseNumber>" so re-opening a closed Compare
// panel (by tapping a word/verse again) redisplays instantly instead of
// re-fetching -- the same version+verse pair never changes once fetched.
const compareCache = {};

async function showComparePassage(versionId, verseNumber) {
  verseNumber = verseNumber || selectedVerseNumber;
  currentCompareVersionId = versionId;
  document.getElementById("bottom-pane").classList.remove("collapsed");

  document.getElementById("greek-toggle-btn").classList.add("hidden");

  const cacheKey = `${versionId}_${verseNumber}`;
  let data = compareCache[cacheKey];
  if (!data) {
    const res = await fetch(
      `/api/compare/passage?version_id=${encodeURIComponent(versionId)}&verse=${encodeURIComponent(verseNumber)}`
    );
    data = await res.json();
    compareCache[cacheKey] = data;
  }

  document.getElementById("compare-version-title").textContent = `${data.version.abbreviation} — ${data.version.title}`;
  currentCompareLanguageTag = data.version.language_tag;
  // The Greek insight is written about the English text sitting directly
  // above it, so keep a handle on exactly what's displayed there.
  currentCompareText = data.text;
  currentCompareRef = data.reference;
  updateGreekVisibility();

  const textEl = document.getElementById("compare-text");
  textEl.innerHTML = "";
  const sup = document.createElement("sup");
  sup.className = "verse-number";
  sup.textContent = data.verse_number;
  textEl.appendChild(sup);
  // Same tappable-word rendering as the primary pane -- any word in the
  // Compare pane's text can be tapped for its own Gloo explanation too.
  renderTappableText(textEl, data.chars, data.text, data.version.language_tag, data.verse_number);

  showCompareState("result");
  // Greek data depends only on the verse, not which translation/language is
  // being compared -- keep it in sync with whatever verse is now showing,
  // but only bother re-fetching if the section is actually open.
  refreshGreekSectionIfExpanded(data.verse_number);
}

document.getElementById("more-btn").addEventListener("click", openLanguagePicker);
document.getElementById("compare-back-btn").addEventListener("click", () => showCompareState("language"));
document.getElementById("compare-change-btn").addEventListener("click", openLanguagePicker);
document.getElementById("compare-close-btn").addEventListener("click", () => {
  document.getElementById("bottom-pane").classList.add("collapsed");
});
document.getElementById("jump-to-verse-btn").addEventListener("click", () => scrollToSelectedVerse(true));
document.getElementById("show-in-chapter-btn").addEventListener("click", () => scrollToSelectedVerse(true));

// --- Original Greek: real Strong's-tagged word data (see data/README.md),
// bundled locally for this one demo chapter -- not a live API call, and not
// AI-generated (a wrong Strong's number or transliteration would be an
// easy, embarrassing thing to get caught fabricating). Shown as an inline,
// collapsible extension of the comparison itself, not a separate modal --
// it's a way of comparing against the original language, same as comparing
// against another translation.
//
// Only offered when Compare is showing English: that's the pairing this
// was actually built for (English vs. Greek/Hebrew). Showing it underneath
// a Chinese or Japanese comparison read as confusing rather than useful --
// there's no claim here that these Greek words align word-for-word to any
// particular translation's phrasing anyway (see the in-sheet note), so
// surfacing it under every language added confusion without adding value.
let greekSectionExpanded = false;
let greekWordsExpanded = false;
const greekWordsCache = {};
const greekInsightCache = {};

function updateGreekVisibility() {
  const isEnglish = currentCompareLanguageTag === "en";
  document.getElementById("greek-toggle-btn").classList.toggle("hidden", !isEnglish);
  if (!isEnglish) {
    greekSectionExpanded = false;
    document.getElementById("greek-section").classList.add("hidden");
    document.getElementById("greek-toggle-btn").classList.remove("expanded");
    document.getElementById("bottom-pane").classList.remove("greek-open");
  }
}

// The insight is what this section leads with -- Gloo writes it, but every
// Greek word it cites comes from the bundled Strong's data the server loads
// itself (see /api/greek-insight), never from the model's own memory.
async function loadGreekInsight(verseNumber) {
  const el = document.getElementById("greek-insight");
  const cacheKey = `${verseNumber}_${currentPrimaryLanguageTag}`;

  const cached = greekInsightCache[cacheKey];
  if (cached) {
    renderGreekInsight(el, cached);
    return;
  }

  el.classList.add("loading");
  el.innerHTML = `
    <span class="spinner" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="15" height="15">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor"
                stroke-width="2.5" stroke-linecap="round" stroke-dasharray="38 18" />
      </svg>
    </span>
    <span>More context coming up…</span>
  `;

  const res = await fetch("/api/greek-insight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      verse_number: verseNumber,
      verse_text: currentCompareText,
      verse_ref: currentCompareRef,
      language_tag: currentPrimaryLanguageTag,
    }),
  });
  const data = await res.json();

  // Guard against a slow response landing after the reader has already moved
  // to another verse -- otherwise verse 8's insight can overwrite verse 9's.
  if (verseNumber !== selectedVerseNumber) return;

  greekInsightCache[cacheKey] = data;
  renderGreekInsight(el, data);
}

function renderGreekInsight(el, data) {
  el.classList.remove("loading");
  if (!data.insight) {
    el.textContent = "No Greek data for this verse.";
    return;
  }
  renderRubyText(el, data.insight_chars);
}

async function loadGreekWords(verseNumber) {
  const list = document.getElementById("greek-word-list");
  list.innerHTML = `<p class="picker-row-subtitle">Loading…</p>`;

  let data = greekWordsCache[verseNumber];
  if (!data) {
    const res = await fetch(`/api/original-language?verse=${encodeURIComponent(verseNumber)}`);
    data = await res.json();
    greekWordsCache[verseNumber] = data;
  }
  renderGreekWords(list, data.words);
}

function toggleGreekSection() {
  greekSectionExpanded = !greekSectionExpanded;
  document.getElementById("greek-section").classList.toggle("hidden", !greekSectionExpanded);
  document.getElementById("greek-toggle-btn").classList.toggle("expanded", greekSectionExpanded);
  document.getElementById("bottom-pane").classList.toggle("greek-open", greekSectionExpanded);
  if (greekSectionExpanded) {
    refreshGreekSectionIfExpanded(selectedVerseNumber);
  }
}

function toggleGreekWords() {
  greekWordsExpanded = !greekWordsExpanded;
  document.getElementById("greek-word-list").classList.toggle("hidden", !greekWordsExpanded);
  document.getElementById("greek-words-toggle-btn").classList.toggle("expanded", greekWordsExpanded);
  if (greekWordsExpanded) {
    loadGreekWords(selectedVerseNumber);
  }
}

function refreshGreekSectionIfExpanded(verseNumber) {
  if (!greekSectionExpanded) return;
  loadGreekInsight(verseNumber);
  // Only the word list needs its own check -- it has a second, independent
  // toggle underneath the insight.
  if (greekWordsExpanded) {
    loadGreekWords(verseNumber);
  }
}

function renderGreekWords(container, words) {
  container.innerHTML = "";
  for (const w of words) {
    const row = document.createElement("div");
    row.className = "greek-word-row";

    const head = document.createElement("div");
    head.className = "greek-word-head";
    head.innerHTML = `
      <span class="greek-script">${w.greek}</span>
      <span class="greek-translit">${w.translit}</span>
      <span class="greek-strongs">${w.strongs}</span>
    `;
    row.appendChild(head);

    if (w.gloss) {
      const gloss = document.createElement("div");
      gloss.className = "greek-gloss";
      gloss.textContent = `"${w.gloss}" in this verse`;
      row.appendChild(gloss);
    }

    const definition = document.createElement("p");
    definition.className = "greek-definition";
    definition.textContent = w.definition;
    row.appendChild(definition);

    container.appendChild(row);
  }
}

document.getElementById("greek-toggle-btn").addEventListener("click", toggleGreekSection);
document.getElementById("greek-words-toggle-btn").addEventListener("click", toggleGreekWords);

// --- Primary-language picker (top pane): a modal sheet, since the top pane
// itself has no room to spare for a persistent picker. Picking a new
// primary swaps whatever was previously primary into the compare pane --
// e.g. picking English/BSB as primary moves Mandarin/CSBS into "Compare",
// for a learner whose primary language is English and Mandarin is the
// side-kick, instead of only working the other way around.
function showPrimaryPickerState(state, headerTitle) {
  document.getElementById("primary-language-list").classList.toggle("hidden", state !== "language");
  document.getElementById("primary-version-list").classList.toggle("hidden", state !== "version");
  document.getElementById("primary-back-btn").classList.toggle("hidden", state !== "version");
  document.getElementById("primary-sheet-title").textContent =
    headerTitle || (state === "version" ? "Choose a version" : "Reading Language");
}

async function openPrimaryPicker() {
  document.getElementById("primary-picker-sheet").classList.remove("hidden");
  showPrimaryPickerState("language");
  const languages = await getLanguages();
  renderLanguageRows(document.getElementById("primary-language-list"), languages, onPrimaryLanguageRowClick);
}

function closePrimaryPicker() {
  document.getElementById("primary-picker-sheet").classList.add("hidden");
}

async function onPrimaryLanguageRowClick(lang) {
  showPrimaryPickerState("version", lang.label);
  const list = document.getElementById("primary-version-list");
  list.innerHTML = `<p class="picker-row-subtitle">Loading…</p>`;
  const res = await fetch(`/api/compare/versions?language=${encodeURIComponent(lang.code)}`);
  const data = await res.json();
  renderVersionRows(list, data.versions, (v) => onPrimaryVersionRowClick(v.id));
}

async function onPrimaryVersionRowClick(versionId) {
  if (versionId === currentPrimaryVersionId) {
    closePrimaryPicker();
    return;
  }
  const previousPrimaryVersionId = currentPrimaryVersionId;
  await loadVerse(versionId);
  if (previousPrimaryVersionId !== null) {
    await showComparePassage(previousPrimaryVersionId);
  }
  closePrimaryPicker();
}

document.getElementById("version-pill").addEventListener("click", openPrimaryPicker);
document.getElementById("close-primary-sheet-btn").addEventListener("click", closePrimaryPicker);
document.querySelector("#primary-picker-sheet .sheet-backdrop").addEventListener("click", closePrimaryPicker);
document.getElementById("primary-back-btn").addEventListener("click", () => showPrimaryPickerState("language"));

async function loadDefaultCompare() {
  const data = await getLanguagesResponse();
  await showComparePassage(data.default_version_id);
}

// Sequenced (not parallel): showComparePassage's default header title reads
// currentReference, which loadVerse is what sets.
(async () => {
  await loadVerse();
  await loadDefaultCompare();
})();
