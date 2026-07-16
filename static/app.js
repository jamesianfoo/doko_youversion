let currentVerseText = "";

async function loadVerse() {
  const res = await fetch("/api/verse");
  const data = await res.json();
  currentVerseText = data.raw_text;

  document.getElementById("verse-loading").classList.add("hidden");
  document.getElementById("verse-reference").textContent = data.reference;
  renderChinese(data.chars, data.tappable);
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

async function onWordTap(word, wrapperEl) {
  document.querySelectorAll(".tappable").forEach((el) => el.classList.remove("active"));
  wrapperEl.classList.add("active");

  const panel = document.getElementById("explanation-panel");
  panel.classList.remove("hidden");
  document.getElementById("explanation-word").textContent = word;
  document.getElementById("explanation-text").textContent = "Thinking…";

  const res = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word, verse_text: currentVerseText }),
  });
  const data = await res.json();
  document.getElementById("explanation-text").textContent = data.explanation;
}

async function loadMemory() {
  const res = await fetch("/api/memory");
  const data = await res.json();
  const priorTaps = data.entries.filter((e) => e.word !== undefined);
  if (priorTaps.length > 1) {
    const previous = priorTaps[priorTaps.length - 2];
    document.getElementById("memory-word").textContent = previous.word;
    document.getElementById("memory-panel").classList.remove("hidden");
  }
}

document.getElementById("play-audio-btn").addEventListener("click", () => {
  if (!currentVerseText) return;
  const utterance = new SpeechSynthesisUtterance(currentVerseText);
  utterance.lang = "zh-CN";
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
});

document.getElementById("reveal-english-btn").addEventListener("click", async (e) => {
  const englishEl = document.getElementById("verse-english");
  if (!englishEl.classList.contains("hidden")) {
    englishEl.classList.add("hidden");
    e.target.textContent = "Show English (BSB)";
    return;
  }
  if (!englishEl.textContent) {
    const res = await fetch("/api/english");
    const data = await res.json();
    englishEl.textContent = data.text;
  }
  englishEl.classList.remove("hidden");
  e.target.textContent = "Hide English";
});

loadVerse();
