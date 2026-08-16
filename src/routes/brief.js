const express = require('express');
const pool = require('../db/pool');
const { SECTIONS, briefProgress } = require('../brief-schema');

const router = express.Router();

const KNOWN = new Set(SECTIONS.map((s) => s.id));

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT sections, updated_at FROM briefs WHERE workspace_id = $1',
      [req.workspace.id]
    );
    const sections = rows[0] ? rows[0].sections : {};
    res.json({
      sections,
      updatedAt: rows[0] ? rows[0].updated_at : null,
      progress: briefProgress(sections),
    });
  } catch (err) {
    console.error('brief get:', err.message);
    res.status(500).json({ error: 'Не удалось загрузить бриф' });
  }
});

/**
 * Сохраняем по одному разделу, а не бриф целиком: мастер заполняется
 * с телефона в несколько заходов, и терять уже введённое при обрыве связи нельзя.
 */
router.put('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  if (!KNOWN.has(sectionId)) {
    return res.status(400).json({ error: 'Неизвестный раздел' });
  }

  const value = req.body && typeof req.body === 'object' ? req.body.value : null;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return res.status(400).json({ error: 'Ожидается объект в поле value' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE briefs
          SET sections = jsonb_set(COALESCE(sections, '{}'::jsonb), ARRAY[$2], $3::jsonb, true),
              updated_at = now()
        WHERE workspace_id = $1
      RETURNING sections`,
      [req.workspace.id, sectionId, JSON.stringify(value)]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Бриф не найден' });
    }
    res.json({ ok: true, progress: briefProgress(rows[0].sections) });
  } catch (err) {
    console.error('brief put:', err.message);
    res.status(500).json({ error: 'Не удалось сохранить раздел' });
  }
});

module.exports = router;
