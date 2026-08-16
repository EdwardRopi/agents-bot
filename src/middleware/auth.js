const { validateInitData } = require('../utils/validateInitData');
const pool = require('../db/pool');

/**
 * Пускает только реальных пользователей из мини-аппа.
 * Заодно заводит пользователя и его рабочее пространство при первом заходе,
 * чтобы роутам не приходилось каждый раз это проверять.
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
    await pool.query(
      `INSERT INTO users (telegram_id, username, first_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_id) DO UPDATE
         SET username = EXCLUDED.username, first_name = EXCLUDED.first_name`,
      [user.id, user.username || null, user.first_name || null]
    );

    let { rows } = await pool.query(
      'SELECT id, name FROM workspaces WHERE owner_id = $1 ORDER BY id LIMIT 1',
      [user.id]
    );

    if (rows.length === 0) {
      const name = user.first_name ? `Бизнес ${user.first_name}` : 'Мой бизнес';
      const created = await pool.query(
        'INSERT INTO workspaces (owner_id, name) VALUES ($1, $2) RETURNING id, name',
        [user.id, name]
      );
      await pool.query('INSERT INTO briefs (workspace_id) VALUES ($1)', [created.rows[0].id]);
      rows = created.rows;
    }

    req.telegramUser = user;
    req.workspace = rows[0];
    next();
  } catch (err) {
    console.error('auth:', err.message);
    res.status(500).json({ error: 'Ошибка базы' });
  }
}

module.exports = { authMiddleware };
