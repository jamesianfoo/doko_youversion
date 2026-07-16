let currentVerseText = "";
let currentExplanationText = "";

async function loadVerse() {
  const res = await fetch("/api/verse");
  const data = await res.json();
  currentVerseText = data.raw_text;

  document.getElementById("verse-loading").classList.add("hidden");
  document.getElementById("reference-pill").textContent = data.reference;
  document.getElementById("version-pill").textContent = data.version.abbreviation;
  document.getElementById("verse-number").textContent = data.verse_number;

  renderChinese(data.chars, data.tappable);
  renderCopyright(data.version.copyright);
  loadMemory();
}

function renderChinese(chars, tappableSpans) {
  const container = document.getElementById("verse-chinese");
  container.innerHTML = "";

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

// Renders a plain (non-tappable) run of pinyin-annotated characters into a
// container -- used for both the verse's non-tappable spans and the full
// word-explanation text.
function renderRubyText(container, chars) {
  container.innerHTML = "";
  for (const charObj of chars) {
    container.appendChild(renderRuby(charObj));
  }
}

function renderCopyright(copyrightText) {
  document.getElementById("copyright-footer").textContent = copyrightText || "";
}

function speakChinese(text) {
  if (!text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
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
  speakChinese(currentVerseText);
});

document.getElementById("play-explanation-audio-btn").addEventListener("click", () => {
  speakChinese(currentExplanationText);
});

document.getElementById("close-sheet-btn").addEventListener("click", closeSheet);
document.querySelector("#explanation-sheet .sheet-backdrop").addEventListener("click", closeSheet);

let compareLanguagesCache = null;

async function openCompareSheet() {
  document.getElementById("compare-sheet").classList.remove("hidden");
  showCompareScreen("language");
  if (!compareLanguagesCache) {
    const res = await fetch("/api/compare/languages");
    compareLanguagesCache = (await res.json()).languages;
  }
  renderLanguageList(compareLanguagesCache);
}

function closeCompareSheet() {
  document.getElementById("compare-sheet").classList.add("hidden");
}

function showCompareScreen(screen) {
  document.getElementById("compare-language-list").classList.toggle("hidden", screen !== "language");
  document.getElementById("compare-version-list").classList.toggle("hidden", screen !== "version");
  document.getElementById("compare-back-btn").classList.toggle("hidden", screen === "language");
  document.getElementById("compare-sheet-title").textContent =
    screen === "language" ? "Compare Translations" : "Choose a version";
}

function renderLanguageList(languages) {
  const list = document.getElementById("compare-language-list");
  list.innerHTML = "";
  for (const lang of languages) {
    const row = document.createElement("button");
    row.className = "picker-row";
    row.innerHTML = `
      <span class="picker-row-body"><span class="picker-row-title">${lang.label}</span></span>
      <span class="picker-chevron">›</span>
    `;
    row.addEventListener("click", () => onLanguageRowClick(lang));
    list.appendChild(row);
  }
}

async function onLanguageRowClick(lang) {
  showCompareScreen("version");
  document.getElementById("compare-sheet-title").textContent = lang.label;
  const list = document.getElementById("compare-version-list");
  list.innerHTML = `<p class="picker-row-subtitle">Loading…</p>`;

  const res = await fetch(`/api/compare/versions?language=${encodeURIComponent(lang.code)}`);
  const data = await res.json();
  renderVersionList(data.versions);
}

function renderVersionList(versions) {
  const list = document.getElementById("compare-version-list");
  list.innerHTML = "";
  for (const v of versions) {
    const row = document.createElement("button");
    row.className = "picker-row";
    row.innerHTML = `
      <span class="picker-badge">${v.abbreviation}</span>
      <span class="picker-row-body"><span class="picker-row-title">${v.title}</span></span>
      <span class="picker-chevron">›</span>
    `;
    row.addEventListener("click", () => onVersionRowClick(v.id));
    list.appendChild(row);
  }
}

async function onVersionRowClick(versionId) {
  await showComparePassage(versionId);
  closeCompareSheet();
}

async function showComparePassage(versionId) {
  const res = await fetch(`/api/compare/passage?version_id=${encodeURIComponent(versionId)}`);
  const data = await res.json();
  document.getElementById("compare-version-title").textContent = `${data.version.abbreviation} — ${data.version.title}`;

  const textEl = document.getElementById("compare-text");
  if (data.chars) {
    // e.g. Japanese furigana -- same {char, pinyin} shape and ruby renderer
    // as the Chinese verse/explanation text, just a different reading system.
    renderRubyText(textEl, data.chars);
  } else {
    textEl.innerHTML = "";
    textEl.textContent = data.text;
  }

  document.getElementById("compare-panel").classList.remove("hidden");
}

function hideComparePanel() {
  document.getElementById("compare-panel").classList.add("hidden");
}

document.getElementById("more-btn").addEventListener("click", openCompareSheet);
document.getElementById("version-pill").addEventListener("click", openCompareSheet);
document.getElementById("close-compare-sheet-btn").addEventListener("click", closeCompareSheet);
document.querySelector("#compare-sheet .sheet-backdrop").addEventListener("click", closeCompareSheet);
document.getElementById("compare-back-btn").addEventListener("click", () => showCompareScreen("language"));
document.getElementById("close-compare-btn").addEventListener("click", hideComparePanel);

loadVerse();
