let currentVerseText = "";
let currentExplanationText = "";
let currentPrimaryVersionId = null;
let currentPrimaryLanguageTag = null;
let currentReference = "";
let featuredVerseNumber = null;

const SPEECH_LANG_MAP = { zh: "zh-CN", en: "en-US", ja: "ja-JP", es: "es-ES", fr: "fr-FR" };

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

  // Reset before rendering; renderChapter sets this from each verse's
  // is_featured flag, which is true in every language (the tappable word
  // itself is Mandarin-only, but the featured verse is still the featured
  // verse regardless of which language is showing).
  featuredVerseNumber = null;
  document.getElementById("jump-to-verse-btn").classList.add("hidden");

  renderChapter(data.verses);
  renderCopyright(data.version.copyright);
  loadMemory();

  if (featuredVerseNumber !== null) {
    document.getElementById("jump-to-verse-btn").classList.remove("hidden");
    // Land straight on the featured verse instead of chapter start -- it's
    // easy to lose among 22 verses otherwise. Deferred a couple frames so
    // the browser finishes laying out the freshly-inserted verses first;
    // calling scrollIntoView in the same tick as the DOM insert can compute
    // against stale (pre-layout) positions and land in the wrong place.
    requestAnimationFrame(() => requestAnimationFrame(() => scrollToFeaturedVerse(false)));
  }
}

function renderChapter(verses) {
  const container = document.getElementById("verse-chapter");
  container.innerHTML = "";
  for (const verse of verses) {
    const p = document.createElement("p");
    p.className = "verse-line";
    p.id = `verse-${verse.number}`;

    if (verse.is_featured) {
      p.classList.add("verse-highlight");
      featuredVerseNumber = verse.number;
    }

    const sup = document.createElement("sup");
    sup.className = "verse-number";
    sup.textContent = verse.number;
    p.appendChild(sup);

    renderVerseContent(p, verse.chars, verse.tappable);
    container.appendChild(p);
  }
}

function scrollToFeaturedVerse(flash) {
  if (featuredVerseNumber === null) return;
  const el = document.getElementById(`verse-${featuredVerseNumber}`);
  if (!el) return;
  // "smooth" behavior here has been unreliable (sometimes never completes),
  // so jump instantly and use the flash pulse for visual feedback instead.
  el.scrollIntoView({ block: "center", behavior: "auto" });
  if (flash) {
    el.classList.add("verse-flash");
    setTimeout(() => el.classList.remove("verse-flash"), 1200);
  }
}

// Appends pinyin/furigana-annotated characters into `container`, wrapping
// any tappable span (only the demo's one tappable verse has these, and only
// when the primary language is Mandarin) in a clickable element that
// triggers the word-explanation lookup.
function renderVerseContent(container, chars, tappableSpans) {
  let i = 0;
  while (i < chars.length) {
    const span = tappableSpans.find((s) => s.start === i);
    if (span) {
      const wrapper = document.createElement("span");
      wrapper.className = "tappable";
      wrapper.dataset.word = span.word;
      for (let j = span.start; j < span.end; j++) {
        wrapper.appendChild(renderRuby(chars[j]));
      }
      wrapper.addEventListener("click", () => onWordTap(span.word, wrapper));
      container.appendChild(wrapper);
      i = span.end;
    } else {
      container.appendChild(renderRuby(chars[i]));
      i++;
    }
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

async function onWordTap(word, wrapperEl) {
  document.querySelectorAll(".tappable").forEach((el) => el.classList.remove("active"));
  wrapperEl.classList.add("active");

  currentExplanationText = "";
  const sheet = document.getElementById("explanation-sheet");
  sheet.classList.remove("hidden");
  document.getElementById("explanation-word").textContent = word;
  document.getElementById("explanation-text").textContent = "Thinking…";

  const res = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word, verse_text: currentVerseText }),
  });
  const data = await res.json();
  currentExplanationText = data.explanation;
  renderRubyText(document.getElementById("explanation-text"), data.explanation_chars);
}

function closeSheet() {
  document.getElementById("explanation-sheet").classList.add("hidden");
}

async function loadMemory() {
  const res = await fetch("/api/memory");
  const data = await res.json();
  const priorTaps = data.entries.filter((e) => e.word !== undefined);
  if (priorTaps.length > 1) {
    const previous = priorTaps[priorTaps.length - 2];
    document.getElementById("memory-word").textContent = previous.word;
    document.getElementById("memory-banner").classList.remove("hidden");
  }
}

document.getElementById("play-audio-btn").addEventListener("click", () => {
  speak(currentVerseText, currentPrimaryLanguageTag);
});

document.getElementById("play-explanation-audio-btn").addEventListener("click", () => {
  // The word-explanation feature only ever explains Mandarin vocabulary,
  // regardless of which language the primary pane is currently showing.
  speak(currentExplanationText, "zh");
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

async function showComparePassage(versionId) {
  const res = await fetch(`/api/compare/passage?version_id=${encodeURIComponent(versionId)}`);
  const data = await res.json();
  document.getElementById("compare-version-title").textContent = `${data.version.abbreviation} — ${data.version.title}`;

  const textEl = document.getElementById("compare-text");
  textEl.innerHTML = "";
  const sup = document.createElement("sup");
  sup.className = "verse-number";
  sup.textContent = data.verse_number;
  textEl.appendChild(sup);
  for (const charObj of data.chars) {
    textEl.appendChild(renderRuby(charObj));
  }

  showCompareState("result");
}

document.getElementById("more-btn").addEventListener("click", openLanguagePicker);
document.getElementById("compare-back-btn").addEventListener("click", () => showCompareState("language"));
document.getElementById("compare-change-btn").addEventListener("click", openLanguagePicker);
document.getElementById("jump-to-verse-btn").addEventListener("click", () => scrollToFeaturedVerse(true));
document.getElementById("show-in-chapter-btn").addEventListener("click", () => scrollToFeaturedVerse(true));

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
