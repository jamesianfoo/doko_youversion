let currentVerseText = "";
let currentExplanationText = "";
let currentExplanationLanguageTag = null;
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

  renderChapter(data.verses);
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

function renderChapter(verses) {
  const container = document.getElementById("verse-chapter");
  container.innerHTML = "";

  let defaultVerseNumber = null;
  for (const verse of verses) {
    const p = document.createElement("p");
    p.className = "verse-line";
    p.id = `verse-${verse.number}`;
    p.addEventListener("click", () => onVerseSelect(verse.number));

    if (verse.is_featured) {
      defaultVerseNumber = verse.number;
    }

    const sup = document.createElement("sup");
    sup.className = "verse-number";
    sup.textContent = verse.number;
    p.appendChild(sup);

    renderTappableText(p, verse.chars, verse.raw_text, currentPrimaryLanguageTag, verse.number);
    container.appendChild(p);
  }

  // Re-rendering (e.g. switching primary language) rebuilds every <p> fresh,
  // so the highlight has to be re-applied to whichever verse is selected --
  // only fall back to the chapter's default featured verse on first load.
  if (selectedVerseNumber === null) {
    selectedVerseNumber = defaultVerseNumber;
  }
  const selectedEl = document.getElementById(`verse-${selectedVerseNumber}`);
  if (selectedEl) selectedEl.classList.add("verse-highlight");
}

function onVerseSelect(verseNumber) {
  if (verseNumber === selectedVerseNumber) return;
  const prevEl = document.getElementById(`verse-${selectedVerseNumber}`);
  if (prevEl) prevEl.classList.remove("verse-highlight");

  selectedVerseNumber = verseNumber;
  const newEl = document.getElementById(`verse-${verseNumber}`);
  if (newEl) newEl.classList.add("verse-highlight");

  if (currentCompareVersionId !== null) {
    showComparePassage(currentCompareVersionId);
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

  currentExplanationText = "";
  currentExplanationLanguageTag = languageTag;
  const sheet = document.getElementById("explanation-sheet");
  sheet.classList.remove("hidden");
  document.getElementById("explanation-word").textContent = word;
  document.getElementById("explanation-text").textContent = "Thinking…";

  const res = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      word,
      verse_text: verseText,
      language_tag: languageTag,
      verse_ref: `${DEMO_CHAPTER_REF}.${verseNumber}`,
      verse_number: verseNumber,
    }),
  });
  const data = await res.json();
  currentExplanationText = data.explanation;
  renderRubyText(document.getElementById("explanation-text"), data.explanation_chars);
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

async function onMemoryWordClick() {
  if (!memoryBannerEntry) return;
  const entry = memoryBannerEntry;
  onVerseSelect(entry.verse_number);
  scrollToSelectedVerse(true);
  const wrapperEl = document.querySelector(
    `#verse-${entry.verse_number} .tappable[data-word="${CSS.escape(entry.word)}"]`
  );
  await onWordTap(entry.word, wrapperEl, entry.verse_text, entry.language_tag, entry.verse_number);
}

document.getElementById("memory-word").addEventListener("click", onMemoryWordClick);

document.getElementById("play-audio-btn").addEventListener("click", () => {
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

async function showComparePassage(versionId, verseNumber) {
  verseNumber = verseNumber || selectedVerseNumber;
  currentCompareVersionId = versionId;
  const res = await fetch(
    `/api/compare/passage?version_id=${encodeURIComponent(versionId)}&verse=${encodeURIComponent(verseNumber)}`
  );
  const data = await res.json();
  document.getElementById("compare-version-title").textContent = `${data.version.abbreviation} — ${data.version.title}`;

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
}

document.getElementById("more-btn").addEventListener("click", openLanguagePicker);
document.getElementById("compare-back-btn").addEventListener("click", () => showCompareState("language"));
document.getElementById("compare-change-btn").addEventListener("click", openLanguagePicker);
document.getElementById("jump-to-verse-btn").addEventListener("click", () => scrollToSelectedVerse(true));
document.getElementById("show-in-chapter-btn").addEventListener("click", () => scrollToSelectedVerse(true));

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
