/* ============================================================
 * CONFIG.JS — НАСТРОЙКИ ТРЕНАЖЁРА «ПОСТУПЛЕНИЕ В 8 КЛАСС АНИЧКОВА ЛИЦЕЯ»
 * ============================================================
 * Токен бота и Chat ID НЕ хранятся в открытом виде в публичном репозитории!
 * При развёртывании через GitHub Actions (deploy.yml) плейсхолдеры ниже
 * заменяются значениями из GitHub Secrets:
 *   - TELEGRAM_BOT_TOKEN
 *   - TELEGRAM_CHAT_ID
 *
 * Также поддерживается переопределение через меню «⚙️ Настройки Telegram»
 * на сайте (сохраняется в localStorage браузера).
 * ============================================================ */

const CONFIG = {
  // Telegram Bot API
  telegram: {
    // Плейсхолдеры для безопасного внедрения через GitHub Actions Secrets
    botToken: "__TELEGRAM_BOT_TOKEN__",
    chatId: "__TELEGRAM_CHAT_ID__",
    botUsername: "ZVEROKZVEROKBOT",
  },

  // Имя учителя или учебного заведения по умолчанию
  teacherName: "Учитель математики",
  schoolName: "Поступление в 8 класс Аничкова лицея · Алгебра и геометрия",

  // Шкала оценивания (в процентах от максимума) — как в эталоне
  gradeScale: {
    5: 85, // от 85% — оценка «5» (Отлично)
    4: 68, // от 68% — оценка «4» (Хорошо)
    3: 50, // от 50% — оценка «3» (Удовлетворительно)
    2: 0,  // менее 50% — оценка «2»
  },

  // Префикс ключей localStorage
  storagePrefix: "anichkov8_",
};

const LS_TOKEN_KEY = CONFIG.storagePrefix + "telegram_bot_token";
const LS_CHAT_KEY = CONFIG.storagePrefix + "telegram_chat_id";

/** @returns {string} токен бота: localStorage → config (если плейсхолдер подменён) → "" */
function getTelegramBotToken() {
  const localToken = localStorage.getItem(LS_TOKEN_KEY);
  if (localToken && localToken.trim()) return localToken.trim();
  if (CONFIG.telegram.botToken && !CONFIG.telegram.botToken.startsWith("__")) {
    return CONFIG.telegram.botToken.trim();
  }
  return "";
}

/** @returns {string} chat_id получателя: localStorage → config → "" */
function getTelegramChatId() {
  const localChatId = localStorage.getItem(LS_CHAT_KEY);
  if (localChatId && localChatId.trim()) return localChatId.trim();
  if (CONFIG.telegram.chatId && !CONFIG.telegram.chatId.startsWith("__")) {
    return CONFIG.telegram.chatId.trim();
  }
  return "";
}

/** Сохранение chatId в localStorage (пустое значение — удаление) */
function setTelegramChatId(chatId) {
  if (chatId) localStorage.setItem(LS_CHAT_KEY, chatId.trim());
  else localStorage.removeItem(LS_CHAT_KEY);
}

/** Сохранение токена в localStorage (для локального тестирования) */
function setTelegramBotToken(token) {
  if (token) localStorage.setItem(LS_TOKEN_KEY, token.trim());
  else localStorage.removeItem(LS_TOKEN_KEY);
}
