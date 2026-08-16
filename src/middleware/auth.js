const { validateInitData } = require('../utils/validateInitData');
const pool = require('../db/pool');
const { isAdmin, ensureWorkspace } = require('../access');

/**
 * Пускает только реальных пользователей мини-аппа, и только тех,
 * кто вошёл по приглашению.
 *
 * Пространство здесь не создаётся: его создаёт приглашение, потому что
 * название пространства берётся из него. Иначе у всех клиентов в очереди
 * было бы одинаковое «Мой бизнес», и было бы не разобрать, чья задача.
 */
async function authMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  if (!initData) {
    return res.status(401).json({ error: 'Нет initData' });
  }

  const { valid, user, reason } = validateInitData(initData, process.env.BOT_TOKEN);
  if (!valid || !user) {
    return res.status(401).json({ error: 'Невалидная подпись', reason });
  }

  try {
    const admin = isAdmin(user.id);

    await pool.query(
      `INSERT INTO users (telegram_id, username, first_name, status)
            VALUES ($1, $2, $3, $4)
       ON CONFLICT (telegram_id) DO UPDATE
          SET username = EXCLUDED.username, first_name = EXCLUDED.first_name`,
      [user.id, user.username || null, user.first_name || null, admin ? 'active' : 'pending']
    );

    const { rows } = await pool.query('SELECT status FROM users WHERE telegram_id = $1', [user.id]);
    const active = admin || (rows[0] && rows[0].status === 'active');

    if (!active) {
      return res.status(403).json({
        error: 'need_invite',
        detail: 'Доступ к команде выдаётся по приглашению. Попросите ссылку у того, кто вас позвал.',
      });
    }

    const name = admin ? 'Мой бизнес' : user.first_name ? `Бизнес ${user.first_name}` : 'Мой бизнес';
    req.telegramUser = user;
    req.workspace = await ensureWorkspace(user.id, name);
    req.isAdmin = admin;
    next();
  } catch (err) {
    console.error('auth:', err.message);
    res.status(500).json({ error: 'Ошибка базы' });
  }
}

module.exports = { authMiddleware };
