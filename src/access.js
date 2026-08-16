const crypto = require('crypto');
const pool = require('./db/pool');

const adminId = process.env.ADMIN_TELEGRAM_ID ? String(process.env.ADMIN_TELEGRAM_ID) : null;

const isAdmin = (telegramId) => Boolean(adminId) && String(telegramId) === adminId;

/**
 * Код приглашения. Читаемая часть от названия — чтобы в списке приглашений
 * было видно, кому какое выдано, — плюс случайный хвост.
 */
function makeCode(label) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 14);
  const tail = crypto.randomBytes(3).toString('hex');
  // Telegram разрешает в deep link только латиницу, цифры, _ и -
  const latin = /^[a-z0-9-]+$/.test(slug) ? slug : 'client';
  return `${latin}-${tail}`;
}

async function createInvite(label, maxUses = 1) {
  const code = makeCode(label);
  await pool.query('INSERT INTO invites (code, label, max_uses) VALUES ($1, $2, $3)', [code, label, maxUses]);
  return { code, label, maxUses };
}

/**
 * Впускает пользователя по коду. Возвращает название пространства, если код
 * подошёл, и null, если нет.
 */
async function redeemInvite(code, user) {
  const { rows } = await pool.query(
    'SELECT code, label, max_uses, uses FROM invites WHERE code = $1',
    [code]
  );
  const invite = rows[0];
  if (!invite || invite.uses >= invite.max_uses) return null;

  await pool.query('UPDATE invites SET uses = uses + 1 WHERE code = $1', [code]);
  await pool.query(
    `INSERT INTO users (telegram_id, username, first_name, status, invited_by)
          VALUES ($1, $2, $3, 'active', $4)
     ON CONFLICT (telegram_id) DO UPDATE
        SET status = 'active',
            invited_by = COALESCE(users.invited_by, EXCLUDED.invited_by),
            username = EXCLUDED.username,
            first_name = EXCLUDED.first_name`,
    [user.id, user.username || null, user.first_name || null, code]
  );

  await ensureWorkspace(user.id, invite.label);
  return invite.label;
}

/** Заводит рабочее пространство, если его ещё нет. Возвращает то, что есть. */
async function ensureWorkspace(telegramId, name) {
  const existing = await pool.query(
    'SELECT id, name FROM workspaces WHERE owner_id = $1 ORDER BY id LIMIT 1',
    [telegramId]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  const created = await pool.query(
    'INSERT INTO workspaces (owner_id, name) VALUES ($1, $2) RETURNING id, name',
    [telegramId, name]
  );
  await pool.query('INSERT INTO briefs (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [
    created.rows[0].id,
  ]);
  return created.rows[0];
}

module.exports = { isAdmin, createInvite, redeemInvite, ensureWorkspace };
