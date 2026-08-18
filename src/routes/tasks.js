const express = require('express');
const pool = require('../db/pool');
const { AGENT_IDS, BRIEF_OPTIONAL } = require('../agents');
const { briefProgress } = require('../brief-schema');
const { notifyAdminNewTask } = require('../bot/bot');
const limits = require('../limits');

const router = express.Router();

/** Переписка с одним агентом: его задачи и ответы, новые снизу. */
router.get('/', async (req, res) => {
  const agent = req.query.agent;
  if (agent && !AGENT_IDS.includes(agent)) {
    return res.status(400).json({ error: 'Неизвестный агент' });
  }
  try {
    const params = [req.workspace.id];
    let sql = `SELECT id, agent, prompt, status, result_md, error, created_at, done_at
                 FROM tasks WHERE workspace_id = $1`;
    if (agent) {
      params.push(agent);
      sql += ' AND agent = $2';
    }
    sql += ' ORDER BY created_at ASC LIMIT 200';

    const { rows } = await pool.query(sql, params);
    res.json({ tasks: rows });
  } catch (err) {
    console.error('tasks list:', err.message);
    res.status(500).json({ error: 'Не удалось загрузить задачи' });
  }
});

router.post('/', async (req, res) => {
  const agent = req.body && req.body.agent;
  const prompt = req.body && req.body.prompt ? String(req.body.prompt).trim() : '';

  if (!AGENT_IDS.includes(agent)) {
    return res.status(400).json({ error: 'Неизвестный агент' });
  }
  if (prompt.length < 5) {
    return res.status(400).json({ error: 'Опишите задачу подробнее' });
  }
  if (prompt.length > 4000) {
    return res.status(400).json({ error: 'Слишком длинная задача' });
  }

  try {
    // Без брифа агенты работать не будут — лучше сказать это здесь,
    // чем поставить задачу в очередь и вернуть отказ через полчаса.
    // Исключение — интервьюер: он этот бриф и заполняет.
    const brief = await pool.query('SELECT sections FROM briefs WHERE workspace_id = $1', [req.workspace.id]);
    const progress = briefProgress(brief.rows[0] ? brief.rows[0].sections : {});
    if (!progress.ready && !BRIEF_OPTIONAL.has(agent)) {
      return res.status(409).json({
        error: 'Сначала заполните бриф',
        detail: `Готово ${progress.done} из ${progress.total} обязательных разделов. Без них агент напишет текст про несуществующую компанию.`,
        progress,
      });
    }

    // Одна задача в работе на агента: очередь из десяти одинаковых просьб
    // никому не помогает, а раннер прогоняет их вручную.
    const busy = await pool.query(
      `SELECT id FROM tasks
        WHERE workspace_id = $1 AND agent = $2 AND status IN ('new','running') LIMIT 1`,
      [req.workspace.id, agent]
    );
    if (busy.rows.length > 0) {
      return res.status(409).json({ error: 'Этот агент ещё занят предыдущей задачей' });
    }

    // Остаток проверяется здесь, а не в середине работы: если лимит кончится
    // между автором и редактором, клиент получит непроверенный текст.
    const allowed = limits.check(req.userRow);
    if (!allowed.ok) {
      return res.status(402).json({
        error: allowed.error,
        detail: allowed.detail,
        reason: allowed.reason,
        limits: allowed.summary,
      });
    }

    const summary = await limits.spend(req.telegramUser.id);

    let rows;
    try {
      ({ rows } = await pool.query(
        `INSERT INTO tasks (workspace_id, agent, prompt) VALUES ($1, $2, $3)
         RETURNING id, agent, prompt, status, created_at`,
        [req.workspace.id, agent, prompt]
      ));
    } catch (err) {
      // Списали, а задача не завелась — вернуть, иначе человек платит
      // за нашу ошибку.
      await limits.refund(req.telegramUser.id).catch(() => {});
      throw err;
    }

    notifyAdminNewTask(rows[0], req.workspace).catch(() => {});
    res.status(201).json({ task: rows[0], limits: summary });
  } catch (err) {
    console.error('tasks create:', err.message);
    res.status(500).json({ error: 'Не удалось поставить задачу' });
  }
});

module.exports = router;
