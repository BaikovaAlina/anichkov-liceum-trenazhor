/* ============================================================
 * TELEGRAM.JS — ОТПРАВКА РЕЗУЛЬТАТОВ В TELEGRAM BOT API
 * ============================================================
 * Схема эталона: клиентский fetch → https://api.telegram.org/bot<TOKEN>/sendMessage
 * (без бэкенда). Токен и chat_id берутся из config.js (подставляются
 * GitHub Actions из Secrets) или из localStorage («⚙️ Настройки Telegram»).
 * ============================================================ */

"use strict";

/** Экранирование для parse_mode=HTML */
function tgEscape(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Секунды → «mm:ss» */
function formatMMSS(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Текст отчёта по работе (форма сообщения эталона).
 * Ученик · Урок · Тема · Результат X/Y · Время mm:ss · Оценка · Дата · Ошибки.
 * @param {object} p
 * @param {string} p.studentName
 * @param {string} p.title    «Урок 3 · Классная работа»
 * @param {string} p.topic
 * @param {object} p.results  {totalScore,maxScore,percent,gradeText,timeSec,date,reviewItems}
 * @returns {string} HTML-текст для parse_mode=HTML
 */
function buildTelegramMessage({ studentName, title, topic, results }) {
  const name = studentName || "Ученик (без имени)";
  const fmt = (n) => (Math.round(n * 100) / 100).toString().replace(".", ",");
  let msg = `📚 <b>Тренажёр · Поступление в 8 класс Аничкова лицея</b>\n\n`;
  msg += `👤 <b>Ученик:</b> ${tgEscape(name)}\n`;
  msg += `📖 <b>Урок:</b> ${tgEscape(title)}\n`;
  msg += `📌 <b>Тема:</b> ${tgEscape(topic)}\n`;
  msg += `📊 <b>Результат:</b> ${fmt(results.totalScore)}/${fmt(results.maxScore)} баллов (${results.percent}%)\n`;
  msg += `⏱ <b>Время:</b> ${formatMMSS(results.timeSec)}\n`;
  msg += `🏆 <b>Оценка:</b> ${tgEscape(results.gradeText)}\n`;
  msg += `📅 <b>Дата:</b> ${tgEscape(results.date)}\n\n`;

  const mistakes = results.reviewItems.filter((i) => !i.isOk);
  if (mistakes.length === 0) {
    msg += `✅ <b>Все задания выполнены безупречно!</b> 🌟`;
  } else {
    msg += `⚠️ <b>Ошибки в заданиях (${mistakes.length}):</b>\n`;
    mistakes.forEach((m) => {
      msg += `• Зад. ${tgEscape(m.qNum)} (${tgEscape(m.qTitle)}): ответ "${tgEscape(m.userVal)}", верно "${tgEscape(m.correctVal)}"\n`;
    });
  }
  return msg.slice(0, 4000); // лимит Telegram — 4096 символов
}

/**
 * Отправка сообщения в Telegram (Bot API sendMessage).
 * @param {string} text HTML-текст
 * @param {string} [chatIdOverride] chat_id (по умолчанию — из настроек)
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function sendToTelegram(text, chatIdOverride) {
  const chatId = chatIdOverride || getTelegramChatId();
  const botToken = getTelegramBotToken();
  if (!chatId) return { ok: false, error: "NO_CHAT_ID" };
  if (!botToken) return { ok: false, error: "NO_TOKEN" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    const data = await res.json();
    if (res.ok && data.ok) return { ok: true };
    return { ok: false, error: data.description || `HTTP ${res.status}` };
  } catch (err) {
    console.error("Telegram send error:", err);
    return { ok: false, error: err.message };
  }
}

/** Человекочитаемый текст ошибки отправки */
function telegramErrorText(error) {
  if (error === "NO_CHAT_ID") return "⚠️ Chat ID учителя не указан! Нажмите «⚙️ Настройки Telegram» вверху страницы и введите ваш Chat ID.";
  if (error === "NO_TOKEN") return "⚠️ Токен Telegram-бота не найден! Настройте GitHub Secrets (см. README).";
  return `❌ Ошибка отправки: ${error}. Проверьте Chat ID и напишите боту @${CONFIG.telegram.botUsername} команду /start.`;
}
