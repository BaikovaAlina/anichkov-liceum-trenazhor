/* ============================================================
 * APP.JS — ДВИЖОК ТРЕНАЖЁРА «ПОСТУПЛЕНИЕ В 8 КЛАСС АНИЧКОВА ЛИЦЕЯ»
 * ============================================================
 * Логика перенесена из эталона (script.js) и расширена:
 *  1. Маршрутизация страниц: index / lesson / trainer / stats
 *     (параметры ?variant=K-1, ?lesson=3 — как в эталоне; дополнительно #K-1, #3)
 *  2. Рендер карточек модулей и уроков (из data/lessons.json → js/tasks.js)
 *  3. Тренажёр-слайды: поля ввода, выбор варианта, точка на клетчатой сетке
 *  4. Мгновенная проверка, пояснения при ошибке, подсчёт баллов и оценки
 *  5. Статистика (localStorage): по сессии и по урокам, сброс
 *  6. Отправка в Telegram, скачивание отчёта, модальные окна
 * ============================================================ */

"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Экранирование для HTML-атрибутов и текста */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Плоский список уроков с привязкой к модулю */
function allLessons() {
  const out = [];
  LESSON_MODULES.forEach((m) => m.lessons.forEach((l) => out.push({ ...l, module: m })));
  return out;
}
function findLesson(num) {
  return allLessons().find((l) => l.num === Number(num));
}

/** Читает параметр из ?query или #hash (например, ?variant=K-1 или #K-1) */
function routeParam(name) {
  const q = new URLSearchParams(window.location.search).get(name);
  if (q) return q;
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ""));
  if (!h) return null;
  if (h.includes("=")) return new URLSearchParams(h).get(name);
  return h;
}

/* ============================================================
 * СТАТИСТИКА (localStorage)
 * ============================================================ */

const Stats = {
  KEY: CONFIG.storagePrefix + "stats",

  /** @returns {{session:{correct:number,incorrect:number,started:string}, lessons:Object}} */
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(this.KEY));
      if (d && d.session && d.lessons) return d;
    } catch (e) { /* пусто */ }
    return { session: { correct: 0, incorrect: 0, started: new Date().toLocaleString("ru-RU") }, lessons: {} };
  },
  save(d) { localStorage.setItem(this.KEY, JSON.stringify(d)); },
  lesson(d, num) {
    if (!d.lessons[num]) d.lessons[num] = { correct: 0, incorrect: 0, variants: {} };
    return d.lessons[num];
  },

  /** Учёт первой проверки ответа (по сессии и по уроку) */
  recordCheck(lessonNum, ok) {
    const d = this.load();
    const L = this.lesson(d, lessonNum);
    if (ok) { d.session.correct++; L.correct++; } else { d.session.incorrect++; L.incorrect++; }
    this.save(d);
  },

  /** Сохранение итогов работы (последняя попытка) */
  recordResult(lessonNum, variantKey, r) {
    const d = this.load();
    const L = this.lesson(d, lessonNum);
    L.variants[variantKey] = {
      totalScore: r.totalScore, maxScore: r.maxScore, percent: r.percent, gradeText: r.gradeText,
      timeSec: r.timeSec, date: r.date,
      mistakes: r.reviewItems.filter((i) => !i.isOk).slice(0, 15),
    };
    this.save(d);
  },

  resetSession() {
    const d = this.load();
    d.session = { correct: 0, incorrect: 0, started: new Date().toLocaleString("ru-RU") };
    this.save(d);
  },
  resetAll() { localStorage.removeItem(this.KEY); },
};

/* ============================================================
 * ГЛАВНАЯ СТРАНИЦА: МОДУЛИ И УРОКИ
 * ============================================================ */

function lessonCardHTML(l) {
  const n = l.num;
  const exam = l.exam ? ` · <span class="exam-mark" title="Тип задания вступительного экзамена">★ экз. ${esc(l.exam)}</span>` : "";
  const badgeCls = l.level === "base" ? "badge-base" : l.level === "adv" ? "badge-adv" : "badge-oly";
  return `
    <div class="lesson-card" data-level="${l.level}" data-exam="${l.exam ? 1 : 0}">
      <div class="lesson-top">
        <div class="lesson-meta">
          <span>Урок ${n}${exam}</span>
          <span class="badge ${badgeCls}">${esc(l.badge)}</span>
        </div>
        <h4><a href="lesson.html?lesson=${n}">${esc(l.title)}</a></h4>
      </div>
      <div class="lesson-actions">
        <a href="trainer.html?variant=K-${n}" class="btn-lesson btn-cw">К-${n} · Классная</a>
        <a href="trainer.html?variant=D-${n}" class="btn-lesson btn-hw">Д-${n} · Домашняя</a>
        <button class="btn-lesson btn-theory" onclick="openTheoryModal(${n})" title="Теория и памятка">📖</button>
      </div>
    </div>`;
}

function initIndex() {
  const root = $("#modulesContainer");
  root.innerHTML = LESSON_MODULES.map((m) => `
    <section class="module-block" data-module="${m.num}">
      <div class="module-header">
        <div class="module-num">${m.num}</div>
        <h2 class="module-title">${esc(m.title)}</h2>
      </div>
      <div class="lesson-grid">${m.lessons.map(lessonCardHTML).join("")}</div>
    </section>`).join("");
  const total = allLessons().length;
  const allBtn = $(".filter-btn[data-filter='all']");
  if (allBtn) allBtn.textContent = `Все уроки (1–${total})`;
}

/**
 * Фильтрация карточек по уровню (логика эталона + фильтр «типы экзамена»).
 * @param {"all"|"base"|"adv"|"oly"|"exam"} level
 * @param {HTMLElement} btn
 */
function filterLessons(level, btn) {
  $$(".filter-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  $$(".lesson-card").forEach((card) => {
    const cl = card.dataset.level;
    let show = level === "all"
      || (level === "base" && cl === "base")
      || (level === "adv" && (cl === "adv" || cl === "oly"))
      || (level === "oly" && cl === "oly")
      || (level === "exam" && card.dataset.exam === "1");
    card.style.display = show ? "flex" : "none";
  });
  $$(".module-block").forEach((mod) => {
    const visible = mod.querySelectorAll('.lesson-card:not([style*="display: none"])');
    mod.style.display = visible.length === 0 ? "none" : "block";
  });
}

/* ============================================================
 * КЛЕТЧАТОЕ ПОЛЕ (SVG): статичные чертежи и перетаскиваемая точка
 * ============================================================ */

const CELL = 28; // размер клетки = клетка тетради эталона
let gridSeq = 0;

/**
 * Рендер координатной сетки.
 * @param {object} g {xmin,xmax,ymin,ymax,axes,pts,segs,lines,poly}
 * @param {boolean} interactive можно ставить точку
 * @param {string} [inputId] id скрытого поля для ответа
 */
function gridSVG(g, interactive, inputId) {
  const id = "g" + ++gridSeq;
  const pad = 14;
  const W = (g.xmax - g.xmin) * CELL + pad * 2;
  const H = (g.ymax - g.ymin) * CELL + pad * 2;
  const X = (x) => pad + (x - g.xmin) * CELL;
  const Y = (y) => pad + (g.ymax - y) * CELL;
  let s = `<svg class="grid-board${interactive ? "" : " static"}" id="${id}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
    data-xmin="${g.xmin}" data-xmax="${g.xmax}" data-ymin="${g.ymin}" data-ymax="${g.ymax}" data-pad="${pad}"
    ${inputId ? `data-input="${inputId}"` : ""} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Клетчатая плоскость">`;
  s += `<defs><clipPath id="${id}c"><rect x="${X(g.xmin)}" y="${Y(g.ymax)}" width="${W - pad * 2}" height="${H - pad * 2}"/></clipPath></defs>`;
  for (let x = g.xmin; x <= g.xmax; x++) s += `<line x1="${X(x)}" y1="${Y(g.ymax)}" x2="${X(x)}" y2="${Y(g.ymin)}" stroke="#C9D9E8" stroke-width="1"/>`;
  for (let y = g.ymin; y <= g.ymax; y++) s += `<line x1="${X(g.xmin)}" y1="${Y(y)}" x2="${X(g.xmax)}" y2="${Y(y)}" stroke="#C9D9E8" stroke-width="1"/>`;
  if (g.axes && g.xmin <= 0 && g.xmax >= 0 && g.ymin <= 0 && g.ymax >= 0) {
    s += `<line x1="${X(g.xmin)}" y1="${Y(0)}" x2="${X(g.xmax)}" y2="${Y(0)}" stroke="#2B2B2B" stroke-width="1.5"/>`;
    s += `<line x1="${X(0)}" y1="${Y(g.ymin)}" x2="${X(0)}" y2="${Y(g.ymax)}" stroke="#2B2B2B" stroke-width="1.5"/>`;
    s += `<text x="${X(g.xmax) - 10}" y="${Y(0) - 5}" font-size="12" fill="#2B2B2B">x</text>`;
    s += `<text x="${X(0) + 5}" y="${Y(g.ymax) + 11}" font-size="12" fill="#2B2B2B">y</text>`;
    s += `<text x="${X(0) - 10}" y="${Y(0) + 13}" font-size="11" fill="#8c7857">0</text>`;
    if (g.xmax >= 1) s += `<text x="${X(1) - 3}" y="${Y(0) + 13}" font-size="11" fill="#8c7857">1</text>`;
    if (g.ymax >= 1) s += `<text x="${X(0) - 10}" y="${Y(1) + 4}" font-size="11" fill="#8c7857">1</text>`;
  }
  s += `<g clip-path="url(#${id}c)">`;
  (g.lines || []).forEach(([k, b]) => {
    s += `<line x1="${X(g.xmin - 1)}" y1="${Y(k * (g.xmin - 1) + b)}" x2="${X(g.xmax + 1)}" y2="${Y(k * (g.xmax + 1) + b)}" stroke="#2E5D4B" stroke-width="2"/>`;
  });
  if (g.poly) {
    s += `<polygon points="${g.poly.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ")}" fill="rgba(226,87,76,0.15)" stroke="#E2574C" stroke-width="2"/>`;
  }
  (g.segs || []).forEach(([x1, y1, x2, y2]) => {
    s += `<line x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}" stroke="#2E5D4B" stroke-width="2"/>`;
  });
  s += `</g>`;
  (g.pts || []).forEach(([name, x, y]) => {
    s += `<circle cx="${X(x)}" cy="${Y(y)}" r="4.5" fill="#2E5D4B"/>`;
    if (name) s += `<text x="${X(x) + 6}" y="${Y(y) - 6}" font-size="14" font-weight="bold" fill="#1b3d30">${esc(name)}</text>`;
  });
  if (interactive) s += `<circle class="drag-pt" cx="-50" cy="-50" r="8" fill="#E2574C" stroke="#fff" stroke-width="2" style="cursor:grab"/>`;
  s += `</svg>`;
  return s;
}

/** Подключает перетаскивание точки ко всем интерактивным сеткам внутри root */
function bindGrids(root) {
  $$(".grid-board:not(.static)", root).forEach((svg) => {
    const inp = document.getElementById(svg.dataset.input);
    const pt = $(".drag-pt", svg);
    const readout = $(`#${svg.dataset.input}_ro`);
    const xmin = +svg.dataset.xmin, xmax = +svg.dataset.xmax, ymin = +svg.dataset.ymin, ymax = +svg.dataset.ymax, pad = +svg.dataset.pad;
    let dragging = false;
    const place = (evt) => {
      const r = svg.getBoundingClientRect();
      const scale = svg.viewBox.baseVal.width / r.width;
      const px = (evt.clientX - r.left) * scale, py = (evt.clientY - r.top) * scale;
      const x = Math.max(xmin, Math.min(xmax, Math.round((px - pad) / CELL + xmin)));
      const y = Math.max(ymin, Math.min(ymax, Math.round(ymax - (py - pad) / CELL)));
      pt.setAttribute("cx", pad + (x - xmin) * CELL);
      pt.setAttribute("cy", pad + (ymax - y) * CELL);
      inp.value = `(${x};${y})`;
      svg.classList.remove("correct", "incorrect");
      if (readout) readout.innerHTML = `Ваша точка: <b>(${x}; ${y})</b>`;
    };
    svg.addEventListener("pointerdown", (e) => { dragging = true; svg.setPointerCapture(e.pointerId); place(e); e.preventDefault(); });
    svg.addEventListener("pointermove", (e) => { if (dragging) place(e); });
    svg.addEventListener("pointerup", () => { dragging = false; });
    svg.addEventListener("pointercancel", () => { dragging = false; });
  });
}

/* ============================================================
 * ТРЕНАЖЁР
 * ============================================================ */

const appState = {
  studentName: "",
  variantKey: "K-1",
  slides: [],
  currentSlide: 0,
  startTime: null,
  results: null,
  attempts: {},      // id поля → число неверных проверок
  firstChecked: {},  // id поля → уже учтено в статистике
};

/**
 * HTML одного поля ответа в зависимости от типа.
 * @returns {string}
 */
function inputHTML(inpMeta, inputId, q) {
  const common = `id="${inputId}" data-answer="${esc(inpMeta.a)}" data-type="${esc(inpMeta.type || "")}"
    data-weight="${inpMeta.w || 1}" data-group="${esc(inpMeta.g || "")}" data-qnum="${esc(q.num)}"
    data-qtitle="${esc(q.title)}" ${inpMeta.tol != null ? `data-tol="${inpMeta.tol}"` : ""}`;
  if (inpMeta.type === "choice") {
    const btns = inpMeta.options.map((o) => `<button type="button" class="choice-btn" data-value="${esc(o)}">${formatMath(esc(o))}</button>`).join("");
    return `<input type="hidden" class="math-input" ${common}><div class="choice-group" data-for="${inputId}">${btns}</div>`;
  }
  if (inpMeta.type === "point") {
    return `<input type="hidden" class="math-input" ${common}>
      <div class="grid-wrap">${gridSVG(inpMeta.grid, true, inputId)}
      <div class="grid-readout" id="${inputId}_ro">Нажмите на узел сетки, чтобы поставить точку</div></div>`;
  }
  const ph = inpMeta.type === "list" ? "через ;" : inpMeta.type === "text" ? "ответ" : "ответ";
  return `<input type="text" class="math-input" ${common} placeholder="${ph}" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" />`;
}

function initTrainer() {
  const savedName = localStorage.getItem(CONFIG.storagePrefix + "student_name") || "";
  const nameInput = $("#studentNameInput");
  if (nameInput) {
    nameInput.value = savedName;
    appState.studentName = savedName;
    nameInput.addEventListener("input", (e) => {
      appState.studentName = e.target.value.trim();
      localStorage.setItem(CONFIG.storagePrefix + "student_name", appState.studentName);
    });
  }

  // Выпадающий список работ (как в эталоне, формируется из банка)
  const sel = $("#variantSelect");
  if (sel) {
    sel.innerHTML = LESSON_MODULES.map((m) => `<optgroup label="Модуль ${m.num}: ${esc(m.title)}">${m.lessons.map((l) => `
      <option value="K-${l.num}">Урок ${l.num} · К-${l.num} (Классная) — ${esc(l.short)}</option>
      <option value="D-${l.num}">Урок ${l.num} · Д-${l.num} (Домашняя) — ${esc(l.short)}</option>`).join("")}</optgroup>`).join("");
    sel.addEventListener("change", (e) => {
      history.replaceState(null, "", `?variant=${e.target.value}`);
      loadVariant(e.target.value);
    });
  }

  const v = routeParam("variant");
  if (v && TASKS[v]) appState.variantKey = v;
  if (sel) sel.value = appState.variantKey;
  loadVariant(appState.variantKey);
  setupEvents();
  window.addEventListener("hashchange", () => {
    const hv = routeParam("variant");
    if (hv && TASKS[hv]) { if (sel) sel.value = hv; loadVariant(hv); }
  });
}

/**
 * Загрузка и рендер работы (варианта).
 * @param {string} vKey «K-3» / «D-3»
 */
function loadVariant(vKey) {
  const data = TASKS[vKey];
  if (!data) return;
  appState.variantKey = vKey;
  appState.currentSlide = 0;
  appState.startTime = new Date();
  appState.results = null;
  appState.attempts = {};
  appState.firstChecked = {};
  document.title = `${data.title} · Тренажёр Аничкова лицея`;

  $("#trainerTitle").textContent = data.title;
  $("#trainerTopic").textContent = data.topic;
  const lessonLink = $("#lessonLink");
  if (lessonLink) lessonLink.href = `lesson.html?lesson=${data.lesson}`;

  const deck = $("#slidesDeck");
  deck.innerHTML = "";
  const slides = [];

  data.questions.forEach((q, qIdx) => {
    const slide = document.createElement("div");
    slide.className = "slide" + (qIdx === 0 ? " active" : "");
    slide.dataset.slideIndex = qIdx;
    let html = `
      <div class="margin-line"></div>
      <div class="crumb">${formatMath(q.crumb || "Задание " + q.num)}</div>
      <h2 class="task-heading"><span class="task-num-badge">${q.num}</span>${formatMath(q.title)}</h2>
      ${q.sub ? `<div class="task-sub">${formatMath(q.sub)}</div>` : ""}
      <div class="task-content">`;
    q.tasks.forEach((t, tIdx) => {
      html += `<div class="task-row" data-row="${qIdx}_${tIdx}">`;
      if (t.label) html += `<div class="task-text">${formatMath(t.label)}</div>`;
      if (t.fig) html += `<div class="grid-wrap" style="margin-bottom:8px;">${gridSVG(t.fig, false)}</div>`;
      html += `<div class="task-expression">`;
      t.parts.forEach((part) => {
        if (typeof part === "string") html += `<span>${formatMath(part)}</span>`;
        else if (part._input !== undefined) html += inputHTML(t.inputs[part._input], `inp_${qIdx}_${tIdx}_${part._input}`, q);
      });
      html += `</div><div class="explain-box" style="display:none" data-explain="${esc(t.e || "")}"></div></div>`;
    });
    if (q.hints && q.hints.length) {
      html += `<div class="hint-box"><span>💡</span><div>${q.hints.map(formatMath).join("<br>")}</div></div>`;
    }
    html += `</div>`;
    slide.innerHTML = html;
    deck.appendChild(slide);
    slides.push(slide);
  });

  // Итоговый слайд (как в эталоне)
  const resultsSlide = document.createElement("div");
  resultsSlide.className = "slide";
  resultsSlide.id = "resultsSlide";
  resultsSlide.innerHTML = `
    <div class="margin-line"></div>
    <div class="crumb">Итоги работы · ${esc(data.title)}</div>
    <div class="results-header">
      <h2 class="task-heading" style="justify-content:center;">🏁 Работа завершена!</h2>
      <div class="score-box">
        <div class="score-points" id="scoreDisplay">0 / 0</div>
        <div class="score-percent" id="percentDisplay">0%</div>
        <div class="grade-badge" id="gradeDisplay">Оценка: —</div>
      </div>
    </div>
    <h3 style="margin-bottom:12px; color:var(--chalk);">📋 Разбор выполненных заданий:</h3>
    <div id="reviewContainer" class="table-scroll"></div>
    <div class="send-box">
      <h3>📩 Отправить результат учителю</h3>
      <p style="font-size:14.5px; color:#52441a;">Результат будет мгновенно доставлен в Telegram-бот учителю.</p>
      <div class="send-inputs">
        <input type="text" class="student-name-input" id="reportStudentName" placeholder="Фамилия и Имя ученика" value="${esc(appState.studentName)}" />
        <button class="btn-send-tg" id="btnSendTelegram">Отправить в Telegram ✈️</button>
        <button class="btn-download-report" id="btnDownloadReport">Скачать отчёт (.txt) 💾</button>
      </div>
      <div class="send-status-msg" id="sendStatusMsg"></div>
    </div>
    <div style="display:flex; gap:12px; justify-content:center; margin-top:20px; flex-wrap:wrap;">
      <button class="btn-nav" id="btnRestart">🔄 Пройти заново</button>
      <a href="lesson.html?lesson=${data.lesson}" class="btn-nav" style="text-decoration:none;">📖 К уроку ${data.lesson}</a>
      <a href="index.html" class="btn-nav" style="text-decoration:none;">📚 Ко всем урокам</a>
    </div>`;
  deck.appendChild(resultsSlide);
  slides.push(resultsSlide);

  $("#btnSendTelegram", resultsSlide).addEventListener("click", sendTrainerResult);
  $("#btnDownloadReport", resultsSlide).addEventListener("click", downloadReport);
  $("#btnRestart", resultsSlide).addEventListener("click", () => loadVariant(appState.variantKey));

  // Выбор варианта ответа
  $$(".choice-group", deck).forEach((grp) => {
    const inp = document.getElementById(grp.dataset.for);
    $$(".choice-btn", grp).forEach((b) => b.addEventListener("click", () => {
      $$(".choice-btn", grp).forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      inp.value = b.dataset.value;
      grp.classList.remove("correct", "incorrect");
    }));
  });
  bindGrids(deck);

  appState.slides = slides;
  updateNav();
}

function updateNav() {
  const total = appState.slides.length;
  const cur = appState.currentSlide;
  const isLast = cur === total - 1;
  const prevBtn = $("#btnPrev"), nextBtn = $("#btnNext"), checkBtn = $("#btnCheck"), counter = $("#slideCounter");
  if (prevBtn) prevBtn.disabled = cur === 0;
  if (nextBtn) {
    nextBtn.style.display = isLast ? "none" : "inline-block";
    nextBtn.textContent = cur === total - 2 ? "К итогам 🏁" : "Далее ▶";
  }
  if (checkBtn) checkBtn.style.display = isLast ? "none" : "inline-block";
  if (counter) counter.textContent = `${cur + 1} / ${total}`;
}

function goToSlide(index) {
  if (index < 0 || index >= appState.slides.length) return;
  appState.slides.forEach((s, i) => s.classList.toggle("active", i === index));
  appState.currentSlide = index;
  if (index === appState.slides.length - 1) {
    calculateResults(true);
    const rn = $("#reportStudentName");
    if (rn && !rn.value.trim()) rn.value = appState.studentName;
  }
  updateNav();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** Визуальная отметка поля: зелёный/красный (для выбора и сетки — на группе) */
function markInput(inp, ok) {
  let el = inp;
  if (inp.dataset.type === "choice") el = $(`.choice-group[data-for="${inp.id}"]`);
  if (inp.dataset.type === "point") el = $(`.grid-board[data-input="${inp.id}"]`);
  el.classList.remove("correct", "incorrect");
  void el.offsetWidth; // перезапуск анимации shake
  el.classList.add(ok ? "correct" : "incorrect");
}

/**
 * Проверка всех полей текущего слайда + пояснения + учёт статистики.
 * @returns {boolean} все ли ответы верны
 */
function checkCurrentSlide() {
  const slide = appState.slides[appState.currentSlide];
  if (!slide || slide.id === "resultsSlide") return false;
  const lessonNum = TASKS[appState.variantKey].lesson;
  let allCorrect = true;

  $$(".task-row", slide).forEach((row) => {
    const inputs = $$(".math-input", row);
    let rowOk = true;
    const correctVals = [];
    inputs.forEach((inp) => {
      const ok = checkAnswer(inp.value, inp.dataset.answer, inp.dataset.type, inp.dataset.tol ? +inp.dataset.tol : undefined);
      markInput(inp, ok);
      if (!appState.firstChecked[inp.id] && inp.value.trim()) {
        appState.firstChecked[inp.id] = true;
        Stats.recordCheck(lessonNum, ok);
      }
      if (!ok) { rowOk = false; appState.attempts[inp.id] = (appState.attempts[inp.id] || 0) + 1; }
      correctVals.push(inp.dataset.answer.split("|")[0]);
    });
    const box = $(".explain-box", row);
    if (rowOk) {
      box.style.display = "none";
    } else {
      allCorrect = false;
      const tries = Math.max(...inputs.map((i) => appState.attempts[i.id] || 0));
      const expl = box.dataset.explain;
      let html = expl ? `💡 <b>Подсказка:</b> ${formatMath(esc(expl))}` : `💡 Проверьте вычисления и попробуйте ещё раз.`;
      if (tries >= 2 || expl) {
        html += tries >= 2 ? `<br>✅ <b>Верный ответ:</b> ${formatMath(esc(correctVals.join("; ")))}` : `<br><i>После второй ошибки будет показан верный ответ.</i>`;
      }
      box.innerHTML = html;
      box.className = "explain-box";
      box.style.display = "block";
    }
  });
  return allCorrect;
}

/**
 * Подсчёт результата (логика эталона: группы, веса, шкала оценок).
 * @param {boolean} [store] сохранить в статистику
 */
function calculateResults(store) {
  const allInputs = $$("#slidesDeck .math-input");
  let totalScore = 0, maxScore = 0;
  const reviewItems = [];
  const groups = {};

  allInputs.forEach((inp) => {
    const w = parseFloat(inp.dataset.weight || 1);
    const grp = inp.dataset.qnum + "_" + inp.dataset.group;
    const val = inp.value;
    const pat = inp.dataset.answer;
    const isOk = checkAnswer(val, pat, inp.dataset.type, inp.dataset.tol ? +inp.dataset.tol : undefined);
    if (!groups[grp]) {
      groups[grp] = { ok: true, w: 0, qNum: inp.dataset.group || inp.dataset.qnum, qTitle: inp.dataset.qtitle, userVal: [], correctVal: [] };
    }
    groups[grp].w += w;
    if (!isOk) groups[grp].ok = false;
    groups[grp].userVal.push(val || "—");
    groups[grp].correctVal.push(pat.split("|")[0]);
  });

  Object.values(groups).forEach((g) => {
    const w = Math.round(g.w * 100) / 100;
    maxScore += w;
    if (g.ok) totalScore += w;
    reviewItems.push({ qNum: g.qNum, qTitle: g.qTitle, userVal: g.userVal.join(", "), correctVal: g.correctVal.join(", "), isOk: g.ok });
  });
  totalScore = Math.round(totalScore * 100) / 100;
  maxScore = Math.round(maxScore * 100) / 100;

  const percent = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  let gradeText = "2 (Требуется повторение)", gradeClass = "grade-2";
  if (percent >= CONFIG.gradeScale[5]) { gradeText = "5 (Отлично!) 🎉"; gradeClass = "grade-5"; }
  else if (percent >= CONFIG.gradeScale[4]) { gradeText = "4 (Хорошо) 👍"; gradeClass = "grade-4"; }
  else if (percent >= CONFIG.gradeScale[3]) { gradeText = "3 (Удовлетворительно) ✍️"; gradeClass = "grade-3"; }

  const timeSec = Math.round((new Date() - appState.startTime) / 1000);
  appState.results = { totalScore, maxScore, percent, gradeText, timeSec, reviewItems, date: new Date().toLocaleString("ru-RU") };

  const vData = TASKS[appState.variantKey];
  if (store) Stats.recordResult(vData.lesson, appState.variantKey, appState.results);

  const fmt = (n) => String(n).replace(".", ",");
  $("#scoreDisplay").textContent = `${fmt(totalScore)} / ${fmt(maxScore)} баллов`;
  $("#percentDisplay").textContent = `${percent}% выполнено · ⏱ ${formatMMSS(timeSec)}`;
  const gd = $("#gradeDisplay");
  gd.textContent = `Оценка: ${gradeText}`;
  gd.className = `grade-badge ${gradeClass}`;

  $("#reviewContainer").innerHTML = `
    <table class="review-table">
      <thead><tr><th>№</th><th>Тема задания</th><th>Ваш ответ</th><th>Верный ответ</th><th>Итог</th></tr></thead>
      <tbody>${reviewItems.map((it) => `
        <tr>
          <td><b>${esc(it.qNum)}</b></td>
          <td>${formatMath(esc(it.qTitle))}</td>
          <td>${formatMath(esc(it.userVal))}</td>
          <td>${it.isOk ? "—" : `<b>${formatMath(esc(it.correctVal))}</b>`}</td>
          <td><span class="status-tag ${it.isOk ? "status-ok" : "status-bad"}">${it.isOk ? "✓ Верно" : "✗ Ошибка"}</span></td>
        </tr>`).join("")}</tbody>
    </table>`;
}

/** Показ статуса отправки в элементе el */
function showStatus(el, type, text) {
  if (!el) return;
  el.className = `send-status-msg ${type}`;
  el.textContent = text;
}

/** Кнопка «Отправить в Telegram ✈️» на итоговом слайде */
async function sendTrainerResult() {
  const statusEl = $("#sendStatusMsg");
  const nameInp = $("#reportStudentName");
  if (nameInp && nameInp.value.trim()) {
    appState.studentName = nameInp.value.trim();
    localStorage.setItem(CONFIG.storagePrefix + "student_name", appState.studentName);
  }
  if (!appState.results) calculateResults(true);
  const v = TASKS[appState.variantKey];
  const text = buildTelegramMessage({ studentName: appState.studentName, title: v.title, topic: v.topic, results: appState.results });
  showStatus(statusEl, "wait", "Отправляю отчёт учителю в Telegram... ⏳");
  const r = await sendToTelegram(text);
  if (r.ok) showStatus(statusEl, "ok", "✅ Результат успешно отправлен учителю в Telegram!");
  else {
    showStatus(statusEl, "err", telegramErrorText(r.error));
    if (r.error === "NO_CHAT_ID" || r.error === "NO_TOKEN") openTelegramSettingsModal();
  }
}

/** Скачивание текстового отчёта (.txt) — как в эталоне */
function downloadReport() {
  if (!appState.results) calculateResults(true);
  const v = TASKS[appState.variantKey];
  const raw = buildTelegramMessage({ studentName: appState.studentName, title: v.title, topic: v.topic, results: appState.results })
    .replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const blob = new Blob([raw], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Отчёт_${appState.studentName || "Ученик"}_${appState.variantKey}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function setupEvents() {
  $("#btnPrev").addEventListener("click", () => goToSlide(appState.currentSlide - 1));
  $("#btnNext").addEventListener("click", () => goToSlide(appState.currentSlide + 1));
  $("#btnCheck").addEventListener("click", checkCurrentSlide);
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" && e.key === "Enter") {
      if (e.target.id !== "studentNameInput" && e.target.id !== "reportStudentName") checkCurrentSlide();
      return;
    }
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.key === "ArrowRight") goToSlide(appState.currentSlide + 1);
    else if (e.key === "ArrowLeft") goToSlide(appState.currentSlide - 1);
  });
}

/* ============================================================
 * СТРАНИЦА УРОКА: теория + «Классная работа» + «Домашнее задание»
 * ============================================================ */

function variantCardHTML(l, kind, saved) {
  const key = `${kind}-${l.num}`;
  const v = TASKS[key];
  const isK = kind === "K";
  const r = saved && saved.variants[key];
  return `
    <div class="lesson-card">
      <div class="lesson-top">
        <div class="lesson-meta">
          <span>${isK ? "К" : "Д"}-${l.num} · ${v.questions.length} заданий</span>
          <span class="badge ${isK ? "badge-base" : "badge-oly"}">${isK ? "Классная работа" : "Домашнее задание"}</span>
        </div>
        <h4>${isK ? "📘 Классная работа" : "📕 Домашнее задание"}</h4>
        <ul class="variant-list">${v.questions.map((q) => `<li>${formatMath(esc(q.title))}</li>`).join("")}</ul>
        <div class="last-result">${r ? `Последний результат: <b>${String(r.totalScore).replace(".", ",")}/${String(r.maxScore).replace(".", ",")}</b> (${r.percent}%), ⏱ ${formatMMSS(r.timeSec)}` : "Ещё не выполнялась"}</div>
      </div>
      <div class="lesson-actions">
        <a href="trainer.html?variant=${key}" class="btn-lesson ${isK ? "btn-cw" : "btn-hw"}">${isK ? "Начать классную" : "Начать домашнюю"} ▶</a>
      </div>
    </div>`;
}

function initLesson() {
  const num = Number(routeParam("lesson")) || 1;
  const l = findLesson(num) || findLesson(1);
  const saved = Stats.load().lessons[l.num];
  document.title = `Урок ${l.num} · ${l.short} · Тренажёр Аничкова лицея`;
  $("#lessonTitle").textContent = `Урок ${l.num} · ${l.title}`;
  $("#lessonSubtitle").textContent = `Модуль ${l.module.num}: ${l.module.part} · ${l.module.title} · ${l.badge}${l.exam ? " · ★ тип задания экзамена " + l.exam : ""}`;

  $("#lessonTheory").innerHTML = `
    <div class="margin-line"></div>
    <div class="crumb">Урок ${l.num} · Памятка</div>
    <h2 class="task-heading"><span class="task-num-badge">📖</span>Теория и памятка</h2>
    <div style="margin-bottom:14px;">${l.theory.rules.map((r) => `<div class="theory-rule-item">📌 ${formatMath(r)}</div>`).join("")}</div>
    ${l.theory.sample ? `<div class="theory-sample"><b>💡 Пример решения:</b><br>${formatMath(l.theory.sample)}</div>` : ""}`;

  $("#lessonVariants").innerHTML = variantCardHTML(l, "K", saved) + variantCardHTML(l, "D", saved);

  const nameInp = $("#lessonStudentName");
  nameInp.value = localStorage.getItem(CONFIG.storagePrefix + "student_name") || "";
  $("#btnSendLesson").addEventListener("click", async () => {
    const name = nameInp.value.trim();
    if (name) localStorage.setItem(CONFIG.storagePrefix + "student_name", name);
    const st = $("#lessonSendStatus");
    const d = Stats.load().lessons[l.num];
    const done = ["K", "D"].map((k) => `${k}-${l.num}`).filter((k) => d && d.variants[k]);
    if (!done.length) { showStatus(st, "err", "⚠️ Сначала выполните классную или домашнюю работу этого урока."); return; }
    const parts = done.map((k) => buildTelegramMessage({ studentName: name, title: TASKS[k].title, topic: TASKS[k].topic,
      results: { ...d.variants[k], reviewItems: d.variants[k].mistakes.map((m) => ({ ...m, isOk: false })) } }));
    const text = parts.map((p, i) => (i ? p.replace(/^📚.*\n\n/, "") : p)).join("\n\n— — —\n\n");
    showStatus(st, "wait", "Отправляю отчёт учителю в Telegram... ⏳");
    const r = await sendToTelegram(text);
    if (r.ok) showStatus(st, "ok", "✅ Результат урока успешно отправлен учителю в Telegram!");
    else showStatus(st, "err", telegramErrorText(r.error));
  });

  const prev = findLesson(l.num - 1), next = findLesson(l.num + 1);
  $("#lessonNav").innerHTML = `
    ${prev ? `<a href="lesson.html?lesson=${prev.num}" class="btn-nav" style="text-decoration:none;">◀ Урок ${prev.num}</a>` : ""}
    <a href="index.html" class="btn-nav" style="text-decoration:none;">📚 Все уроки</a>
    ${next ? `<a href="lesson.html?lesson=${next.num}" class="btn-nav" style="text-decoration:none;">Урок ${next.num} ▶</a>` : ""}`;
  window.addEventListener("hashchange", () => window.location.reload());
}

/* ============================================================
 * СТРАНИЦА СТАТИСТИКИ
 * ============================================================ */

function initStats() {
  const render = () => {
    const d = Stats.load();
    const s = d.session;
    const total = s.correct + s.incorrect;
    $("#statsSummary").innerHTML = `
      <div class="score-box"><div class="score-points ok">${s.correct}</div><div class="score-percent">верных ответов</div></div>
      <div class="score-box"><div class="score-points bad">${s.incorrect}</div><div class="score-percent">ошибок</div></div>
      <div class="score-box"><div class="score-points">${total ? Math.round((s.correct / total) * 100) : 0}%</div><div class="score-percent">точность</div></div>`;
    $("#statsSince").textContent = `Сессия начата: ${s.started}. Учитывается первая проверка каждого ответа.`;
    const rows = allLessons().filter((l) => d.lessons[l.num]).map((l) => {
      const L = d.lessons[l.num];
      const cell = (k) => {
        const r = L.variants[`${k}-${l.num}`];
        return r ? `${r.percent}% · ${formatMMSS(r.timeSec)}` : "—";
      };
      return `<tr>
        <td><b>${l.num}</b></td>
        <td><a href="lesson.html?lesson=${l.num}" style="color:var(--chalk);">${esc(l.short)}</a></td>
        <td><span class="status-tag status-ok">${L.correct}</span></td>
        <td><span class="status-tag status-bad">${L.incorrect}</span></td>
        <td>${cell("K")}</td><td>${cell("D")}</td></tr>`;
    });
    $("#statsTable").innerHTML = rows.length
      ? `<table class="review-table"><thead><tr><th>Урок</th><th>Тема</th><th>Верно</th><th>Ошибки</th><th>Классная</th><th>Домашняя</th></tr></thead><tbody>${rows.join("")}</tbody></table>`
      : `<div class="hint-box"><span>💡</span><div>Статистики пока нет — откройте любой урок и проверьте ответы.</div></div>`;
  };
  render();
  $("#btnResetSession").addEventListener("click", () => { Stats.resetSession(); render(); });
  $("#btnResetAll").addEventListener("click", () => {
    if (confirm("Удалить всю статистику по всем урокам?")) { Stats.resetAll(); render(); }
  });
}

/* ============================================================
 * МОДАЛЬНЫЕ ОКНА: ТЕОРИЯ И НАСТРОЙКИ TELEGRAM (как в эталоне)
 * ============================================================ */

function openTheoryModal(lessonNum) {
  const modal = $("#theoryModal"), content = $("#theoryContent");
  const l = findLesson(lessonNum);
  if (!modal || !content || !l) return;
  content.innerHTML = `
    <h3 class="modal-title">📖 Урок ${l.num}. ${esc(l.title)}</h3>
    <div style="font-size:13.5px; color:#8c7857; margin-bottom:12px;">
      Модуль ${l.module.num}: <b>${esc(l.module.title)}</b> · <span class="badge badge-adv">${esc(l.badge)}</span>
    </div>
    <div style="margin-bottom:14px;">${l.theory.rules.map((r) => `<div class="theory-rule-item">📌 ${formatMath(r)}</div>`).join("")}</div>
    ${l.theory.sample ? `<div class="theory-sample"><b>💡 Пример решения:</b><br>${formatMath(l.theory.sample)}</div>` : ""}
    <div style="margin-top:14px;"><a href="lesson.html?lesson=${l.num}" class="btn-hero" style="padding:8px 18px; font-size:14.5px;">Открыть урок ▶</a></div>`;
  modal.classList.add("open");
}
function closeTheoryModal() { const m = $("#theoryModal"); if (m) m.classList.remove("open"); }

function openTelegramSettingsModal() {
  const modal = $("#settingsModal");
  if (!modal) return;
  const input = $("#settingChatId");
  if (input) input.value = getTelegramChatId();
  modal.classList.add("open");
}
function closeTelegramSettingsModal() { const m = $("#settingsModal"); if (m) m.classList.remove("open"); }

function saveTelegramSettings() {
  const input = $("#settingChatId"), msgEl = $("#settingStatusMsg");
  if (!input) return;
  setTelegramChatId(input.value.trim());
  showStatus(msgEl, "ok", "✅ Chat ID успешно сохранён в браузере!");
  setTimeout(closeTelegramSettingsModal, 1200);
}

/** Тестовая отправка из окна настроек (как в эталоне) */
async function testTelegramPing() {
  const input = $("#settingChatId"), msgEl = $("#settingStatusMsg");
  const chatId = input ? input.value.trim() : "";
  if (!chatId) { showStatus(msgEl, "err", "⚠️ Сначала введите Chat ID!"); return; }
  showStatus(msgEl, "wait", "Отправляю тестовый сигнал боту... ⏳");
  const r = await sendToTelegram(`🔔 <b>Тестовое подключение успешно!</b>\n\nТренажёр «Поступление в 8 класс Аничкова лицея» подключён к Telegram-боту @${CONFIG.telegram.botUsername}. Отчёты учеников будут приходить в этот чат! 🎉`, chatId);
  if (r.ok) { setTelegramChatId(chatId); showStatus(msgEl, "ok", "🎉 Сообщение доставлено в Telegram! Связь установлена."); }
  else showStatus(msgEl, "err", r.error === "NO_TOKEN" ? "⚠️ Токен Telegram-бота не найден!" : `❌ Ошибка: ${r.error}. Убедитесь, что вы нажали /start боту @${CONFIG.telegram.botUsername}.`);
}

/* ============================================================
 * АВТОЗАПУСК
 * ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  if ($("#modulesContainer")) initIndex();
  if ($("#slidesDeck")) initTrainer();
  if ($("#lessonPage")) initLesson();
  if ($("#statsPage")) initStats();
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeTheoryModal(); closeTelegramSettingsModal(); }
  });
});
