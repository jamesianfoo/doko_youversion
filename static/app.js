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

document.getElementById("more-btn").addEventListener("click", () => {
  document.getElementById("more-menu").classList.toggle("hidden");
});

document.getElementById("close-sheet-btn").addEventListener("click", closeSheet);
document.getElementById("explanation-backdrop").addEventListener("click", closeSheet);

async function loadCompareLanguages() {
  const res = await fetch("/api/compare/languages");
  const data = await res.json();
  const languageSelect = document.getElementById("compare-language-select");
  for (const lang of data.languages) {
    const opt = document.createElement("option");
    opt.value = lang.code;
    opt.textContent = lang.label;
    languageSelect.appendChild(opt);
  }
}

async function onCompareLanguageChange() {
  const code = document.getElementById("compare-language-select").value;
  const versionSelect = document.getElementById("compare-version-select");
  versionSelect.innerHTML = "";

  if (!code) {
    versionSelect.classList.add("hidden");
    hideComparePanel();
    return;
  }

  const res = await fetch(`/api/compare/versions?language=${encodeURIComponent(code)}`);
  const data = await res.json();
  for (const v of data.versions) {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = `${v.abbreviation} — ${v.title}`;
    versionSelect.appendChild(opt);
  }
  versionSelect.classList.remove("hidden");

  if (data.versions.length > 0) {
    await showComparePassage(data.versions[0].id);
  }
}

async function onCompareVersionChange() {
  const versionId = document.getElementById("compare-version-select").value;
  if (versionId) {
    await showComparePassage(versionId);
  }
}

async function showComparePassage(versionId) {
  const res = await fetch(`/api/compare/passage?version_id=${encodeURIComponent(versionId)}`);
  const data = await res.json();
  document.getElementById("compare-version-title").textContent = `${data.version.abbreviation} — ${data.version.title}`;
  document.getElementById("compare-text").textContent = data.text;
  document.getElementById("compare-panel").classList.remove("hidden");
  document.getElementById("close-compare-btn").classList.remove("hidden");
}

function hideComparePanel() {
  document.getElementById("compare-panel").classList.add("hidden");
  document.getElementById("close-compare-btn").classList.add("hidden");
}

document.getElementById("compare-language-select").addEventListener("change", onCompareLanguageChange);
document.getElementById("compare-version-select").addEventListener("change", onCompareVersionChange);
document.getElementById("close-compare-btn").addEventListener("click", () => {
  hideComparePanel();
  document.getElementById("compare-language-select").value = "";
  document.getElementById("compare-version-select").classList.add("hidden");
  document.getElementById("more-menu").classList.add("hidden");
});

loadCompareLanguages();
loadVerse();
