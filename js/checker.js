/* ============================================================
 * CHECKER.JS — ФОРМАТИРОВАНИЕ ДРОБЕЙ И ПРОВЕРКА ОТВЕТОВ
 * ============================================================
 * formatMath() перенесена из эталона без изменений.
 * checkAnswer() — совместима с эталоном (типы "", list, coords) и
 * расширена: числовой разбор с допуском, дроби 3/4, смешанные 2 1/3,
 * десятичная запятая, проценты/градусы, а также типы text, choice, point.
 * ============================================================ */

"use strict";

/**
 * Вертикальные дроби с горизонтальной чертой (из эталона, 1:1).
 * @param {string} text
 * @returns {string} HTML
 */
function formatMath(text) {
  if (!text || typeof text !== "string") return text;

  const urls = [];
  text = text.replace(/https?:\/\/[^\s"'<>]+/g, (m) => {
    urls.push(m);
    return `___URL_${urls.length - 1}___`;
  });

  text = text.replace(
    /\(([^)]+)\)\s*\/\s*\(([^)]+)\)/g,
    `<span class="frac"><span class="num">$1</span><span class="den">$2</span></span>`
  );
  text = text.replace(
    /\(([^)]+)\)\s*\/\s*([a-zA-Zа-яА-Я0-9]+)/g,
    `<span class="frac"><span class="num">$1</span><span class="den">$2</span></span>`
  );
  text = text.replace(
    /(?<![<a-zA-Z0-9\/:\\])([a-zA-Zа-яА-Я0-9]+)\s*\/\s*\(([^)]+)\)/g,
    `<span class="frac"><span class="num">$1</span><span class="den">$2</span></span>`
  );
  text = text.replace(
    /(?<![<a-zA-Z0-9\/:\\])([-−]?\d+)\s+(\d+)\s*\/\s*(\d+)(?![a-zA-Z0-9\/>])/g,
    `<span class="mixed-num">$1<span class="frac"><span class="num">$2</span><span class="den">$3</span></span></span>`
  );
  text = text.replace(
    /(?<![<a-zA-Z0-9\/:\\])[-−]\s*([a-zA-Zа-яА-Я0-9]+)\s*\/\s*([a-zA-Zа-яА-Я0-9]+)(?![a-zA-Z0-9\/>])/g,
    `<span class="neg-frac"><span class="frac"><span class="num">$1</span><span class="den">$2</span></span></span>`
  );
  text = text.replace(
    /(?<![<a-zA-Z0-9\/:\\])([a-zA-Zа-яА-Я0-9]+)\s*\/\s*([a-zA-Zа-яА-Я0-9]+)(?![a-zA-Z0-9\/>])/g,
    `<span class="frac"><span class="num">$1</span><span class="den">$2</span></span>`
  );

  text = text.replace(/___URL_(\d+)___/g, (_, i) => urls[i]);
  return text;
}

/**
 * Базовая нормализация строки: trim, нижний регистр, ё→е, единый минус,
 * удаление °, %, «x =», лишних пробелов.
 * @param {*} val
 * @returns {string}
 */
function canon(val) {
  if (val == null) return "";
  let s = String(val).trim().toLowerCase();
  s = s.replace(/ё/g, "е").replace(/[−–—]/g, "-");
  s = s.replace(/[×*∙⋅]/g, "·");
  s = s.replace(/[°%]/g, "");
  s = s.replace(/^[a-zа-я]\s*=\s*/i, ""); // «x = 5» → «5»
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Разбор числа: целые, десятичные (запятая или точка), обыкновенные 3/4,
 * смешанные «2 1/3» и «-2 1/3». Возвращает NaN, если это не число.
 * @param {string} raw
 * @returns {number}
 */
function parseNumber(raw) {
  const s = canon(raw).replace(/,/g, ".");
  if (!s) return NaN;
  let m = s.match(/^(-?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/); // смешанное число
  if (m) {
    const v = +m[2] + +m[3] / +m[4];
    return +m[4] === 0 ? NaN : (m[1] ? -v : v);
  }
  m = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/); // дробь
  if (m) return +m[2] === 0 ? NaN : +m[1] / +m[2];
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return parseFloat(s);
  return NaN;
}

/**
 * Сравнение чисел. Точное совпадение (1e-9) либо допуск ±0.01, если
 * правильный ответ — бесконечная/длинная дробь (например, 1/3 ≈ 0,33).
 * @param {number} u ответ ученика
 * @param {number} p эталон
 * @param {number} [tol] явный допуск
 */
function numbersEqual(u, p, tol) {
  if (isNaN(u) || isNaN(p)) return false;
  if (Math.abs(u - p) < 1e-9) return true;
  const autoTol = Math.abs(p * 100 - Math.round(p * 100)) > 1e-9 ? 0.01 : 0;
  const t = tol != null ? tol : autoTol;
  return t > 0 && Math.abs(u - p) <= t + 1e-12;
}

/** Разбор списка значений (порядок не важен), разделители: , ; пробел */
function parseList(val) {
  if (!val) return [];
  const s = String(val).replace(/[−–—]/g, "-");
  // Если есть «;» — это разделитель, а запятая внутри — десятичная («0; -2,75; 7»)
  if (s.includes(";")) return s.split(";").map((x) => x.trim().replace(",", ".")).filter(Boolean);
  return s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
}

/** Сравнение двух списков как мультимножеств (числа — численно) */
function listsEqual(a, b) {
  if (a.length !== b.length) return false;
  const used = new Array(b.length).fill(false);
  return a.every((x) => {
    const xn = parseNumber(x);
    const j = b.findIndex((y, k) => !used[k] && (isNaN(xn) ? canon(x) === canon(y) : numbersEqual(xn, parseNumber(y))));
    if (j < 0) return false;
    used[j] = true;
    return true;
  });
}

/** Координаты «(3; -2)», «3;-2», «3 -2» → [3, -2] */
function parseCoords(val) {
  const s = canon(val).replace(/[()]/g, "").trim();
  const parts = s.includes(";") ? s.split(";") : s.split(/[\s,]+/);
  if (parts.length !== 2) return null;
  const xy = parts.map((p) => parseNumber(p));
  return xy.some(isNaN) ? null : xy;
}

/**
 * Проверка одного ответа.
 * @param {string} userVal ответ ученика
 * @param {string} correctPattern эталон; альтернативы через «|»
 * @param {string} [type] "", "list", "coords", "point", "text", "choice"
 * @param {number} [tol] допуск для чисел
 * @returns {boolean}
 */
function checkAnswer(userVal, correctPattern, type, tol) {
  if (!userVal || !String(userVal).trim()) return false;
  const userTrim = String(userVal).trim();
  const acceptable = String(correctPattern).split("|").map((p) => p.trim());

  if (type === "list") {
    const u = parseList(userTrim);
    return acceptable.some((pat) => listsEqual(u, parseList(pat)));
  }
  if (type === "coords" || type === "point") {
    const u = parseCoords(userTrim);
    if (!u) return false;
    return acceptable.some((pat) => {
      const p = parseCoords(pat);
      return p && numbersEqual(u[0], p[0], tol) && numbersEqual(u[1], p[1], tol);
    });
  }
  if (type === "choice") {
    return acceptable.some((pat) => canon(pat) === canon(userTrim));
  }

  const uCanon = canon(userTrim).replace(/\s/g, "");
  const uNum = parseNumber(userTrim);
  for (const pat of acceptable) {
    if (uCanon === canon(pat).replace(/\s/g, "")) return true;
    if (type !== "text" && numbersEqual(uNum, parseNumber(pat), tol)) return true;
  }
  return false;
}

if (typeof module !== "undefined") {
  module.exports = { checkAnswer, parseNumber, canon, parseList, parseCoords, numbersEqual, formatMath };
}
