const express = require('express');
const pool = require('../db/pool');
const { AGENTS, HOST, BRIEF_OPTIONAL } = require('../agents');
const { SECTIONS, briefProgress } = require('../brief-schema');

const router = express.Router();

/**
 * Всё, что нужно приложению при запуске: кто я, какое у меня пространство,
 * готов ли бриф, кто в команде и из каких разделов состоит анкета.
 * Один запрос вместо четырёх — мини-апп открывается на телефоне,
 * и каждый лишний round-trip виден глазом.
 */
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT sections FROM briefs WHERE workspace_id = $1',
      [req.workspace.id]
    );
    const sections = rows[0] ? rows[0].sections : {};

    res.json({
      user: {
        id: req.telegramUser.id,
        firstName: req.telegramUser.first_name || null,
        username: req.telegramUser.username || null,
      },
      workspace: req.workspace,
      brief: { progress: briefProgress(sections), schema: SECTIONS },
      agents: AGENTS.map((a) => ({ ...a, needsBrief: !BRIEF_OPTIONAL.has(a.id) })),
      host: HOST,
    });
  } catch (err) {
    console.error('me:', err.message);
    res.status(500).json({ error: 'Не удалось загрузить профиль' });
  }
});

/** Переименовать рабочее пространство. */
router.patch('/workspace', async (req, res) => {
  const name = (req.body && req.body.name ? String(req.body.name) : '').trim();
  if (!name || name.length > 80) {
    return res.status(400).json({ error: 'Название от 1 до 80 символов' });
  }
  try {
    await pool.query('UPDATE workspaces SET name = $1 WHERE id = $2', [name, req.workspace.id]);
    res.json({ ok: true, name });
  } catch (err) {
    console.error('rename:', err.message);
    res.status(500).json({ error: 'Не удалось переименовать' });
  }
});

module.exports = router;
