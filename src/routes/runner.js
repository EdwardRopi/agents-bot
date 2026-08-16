const express = require('express');
const pool = require('../db/pool');
const { notifyUserTaskDone } = require('../bot/bot');

const router = express.Router();

/**
 * Мост между приложением и твоим компьютером.
 *
 * Пока нет ключа к API, агентов прогоняешь ты сам через Claude Code:
 * раннер забирает отсюда задачи вместе с брифом, ты выполняешь их привычными
 * агентами smm / editor / leads и отправляешь результат обратно.
 *
 * Когда ключ появится, эти же эндпоинты начнёт дёргать серверный воркер,
 * а мини-апп не заметит разницы — для него ничего не меняется.
 */

/** Что ждёт работы. Бриф отдаём сразу: без него задачу не выполнить. */
router.get('/tasks', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.agent, t.prompt, t.status, t.created_at,
              w.id AS workspace_id, w.name AS workspace_name, w.owner_id,
              b.sections AS brief
         FROM tasks t
         JOIN workspaces w ON w.id = t.workspace_id
         LEFT JOIN briefs b ON b.workspace_id = w.id
        WHERE t.status = $1
        ORDER BY t.created_at ASC
        LIMIT 20`,
      [req.query.status || 'new']
    );
    res.json({ tasks: rows });
  } catch (err) {
    console.error('runner list:', err.message);
    res.status(500).json({ error: 'Не удалось получить очередь' });
  }
});

/** Взять задачу в работу, чтобы её не подхватили дважды. */
router.post('/tasks/:id/claim', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE tasks SET status = 'running', taken_at = now()
        WHERE id = $1 AND status = 'new'
        RETURNING id, agent, status`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(409).json({ error: 'Задача уже взята или не существует' });
    }
    res.json({ task: rows[0] });
  } catch (err) {
    console.error('runner claim:', err.message);
    res.status(500).json({ error: 'Не удалось взять задачу' });
  }
});

/** Вернуть результат. Текст в markdown — мини-апп покажет его как есть. */
router.post('/tasks/:id/result', async (req, res) => {
  const result = req.body && req.body.result_md ? String(req.body.result_md) : '';
  if (result.trim().length < 2) {
    return res.status(400).json({ error: 'Пустой результат' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE tasks SET status = 'done', result_md = $2, done_at = now()
        WHERE id = $1 AND status IN ('new','running')
        RETURNING id, agent, status, workspace_id`,
      [req.params.id, result]
    );
    if (rows.length === 0) {
      return res.status(409).json({ error: 'Задача уже закрыта или не существует' });
    }

    const owner = await pool.query('SELECT owner_id FROM workspaces WHERE id = $1', [rows[0].workspace_id]);
    if (owner.rows[0]) {
      notifyUserTaskDone(owner.rows[0].owner_id, rows[0]).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('runner result:', err.message);
    res.status(500).json({ error: 'Не удалось сохранить результат' });
  }
});

/** Не получилось — честно сказать клиенту, а не держать его в ожидании. */
router.post('/tasks/:id/fail', async (req, res) => {
  const message = req.body && req.body.error ? String(req.body.error).slice(0, 500) : 'Не удалось выполнить';
  try {
    const { rows } = await pool.query(
      `UPDATE tasks SET status = 'failed', error = $2, done_at = now()
        WHERE id = $1 AND status IN ('new','running')
        RETURNING id, agent, status, error, workspace_id`,
      [req.params.id, message]
    );
    if (rows.length === 0) {
      return res.status(409).json({ error: 'Задача уже закрыта или не существует' });
    }
    const owner = await pool.query('SELECT owner_id FROM workspaces WHERE id = $1', [rows[0].workspace_id]);
    if (owner.rows[0]) {
      notifyUserTaskDone(owner.rows[0].owner_id, rows[0]).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('runner fail:', err.message);
    res.status(500).json({ error: 'Не удалось отметить провал' });
  }
});

module.exports = router;
