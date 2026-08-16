const crypto = require('crypto');

/**
 * Проверяет, что initData реально пришла от Telegram, а не подделана.
 * Без этой проверки любой может прислать запрос от имени чужого пользователя.
 *
 * Telegram подписывает данные ключом, выведенным из токена бота. Мы пересчитываем
 * подпись у себя и сравниваем.
 */
function validateInitData(initData, botToken) {
  if (!initData || !botToken) return { valid: false, user: null };

  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  if (!hash) return { valid: false, user: null };
  urlParams.delete('hash');

  const dataCheckArr = [];
  for (const [key, value] of urlParams.entries()) {
    dataCheckArr.push(`${key}=${value}`);
  }
  dataCheckArr.sort();
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (calculatedHash !== hash) {
    return { valid: false, user: null };
  }

  // Защита от повторного использования перехваченных данных
  const authDate = parseInt(urlParams.get('auth_date'), 10);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > 86400) {
    return { valid: false, user: null, reason: 'expired' };
  }

  const userJson = urlParams.get('user');
  const user = userJson ? JSON.parse(userJson) : null;

  return { valid: true, user };
}

module.exports = { validateInitData };
