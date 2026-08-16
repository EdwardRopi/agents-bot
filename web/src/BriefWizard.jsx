import { useState } from 'react';
import { api, haptic } from './api';

/** Пустое значение под тип поля — чтобы форма не спотыкалась о undefined. */
function blank(field) {
  if (field.type === 'list' || field.type === 'table') return [];
  return '';
}

function ListField({ field, value, onChange }) {
  const items = Array.isArray(value) ? value : [];
  const set = (i, v) => onChange(items.map((it, k) => (k === i ? v : it)));
  return (
    <div className="field">
      <label>{field.label}</label>
      {items.map((item, i) => (
        <div className="list-row" key={i}>
          <input type="text" value={item} placeholder={field.placeholder} onChange={(e) => set(i, e.target.value)} />
          <button className="icon-btn" onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label="Убрать">
            −
          </button>
        </div>
      ))}
      <button className="btn ghost slim" onClick={() => onChange([...items, ''])}>
        Добавить
      </button>
    </div>
  );
}

function TableField({ field, value, onChange }) {
  const rows = Array.isArray(value) ? value : [];
  const empty = Object.fromEntries(field.columns.map((c) => [c.key, '']));
  const setCell = (i, key, v) => onChange(rows.map((r, k) => (k === i ? { ...r, [key]: v } : r)));
  return (
    <div className="field">
      <label>{field.label}</label>
      {rows.map((row, i) => (
        <div className="tbl-card" key={i}>
          <div className="row-head">
            <span>Позиция {i + 1}</span>
            <button className="btn ghost slim" onClick={() => onChange(rows.filter((_, k) => k !== i))}>
              Убрать
            </button>
          </div>
          {field.columns.map((c) => (
            <div className="field" key={c.key} style={{ marginBottom: 8 }}>
              <label>{c.label}</label>
              <input type="text" value={row[c.key] || ''} onChange={(e) => setCell(i, c.key, e.target.value)} />
            </div>
          ))}
        </div>
      ))}
      <button className="btn ghost slim" onClick={() => onChange([...rows, empty])}>
        Добавить позицию
      </button>
    </div>
  );
}

export default function BriefWizard({ schema, sections, onSaved, onDone }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(() => sections || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const section = schema[step];
  const values = draft[section.id] || {};

  const setField = (key, v) =>
    setDraft({ ...draft, [section.id]: { ...values, [key]: v } });

  async function saveAndGo(delta) {
    setSaving(true);
    setError(null);
    try {
      // Сохраняем по разделу: анкету заполняют с телефона в несколько заходов,
      // и терять введённое при обрыве связи нельзя.
      const payload = {};
      section.fields.forEach((f) => {
        payload[f.key] = values[f.key] !== undefined ? values[f.key] : blank(f);
      });
      const res = await api.saveSection(section.id, payload);
      await onSaved(res.progress);
      haptic();

      const next = step + delta;
      if (next < 0 || next >= schema.length) {
        onDone();
      } else {
        setStep(next);
        window.scrollTo(0, 0);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wizard">
      <div className="steps">
        {schema.map((s, i) => (
          <i key={s.id} className={i <= step ? 'on' : ''} />
        ))}
      </div>

      <p className="section-title" style={{ marginTop: 14 }}>
        Шаг {section.step} из {schema.length}
        {section.required ? '' : ' · необязательно'}
      </p>
      <h2>{section.title}</h2>
      <p className="hint">{section.hint}</p>

      {section.fields.map((f) => {
        const v = values[f.key] !== undefined ? values[f.key] : blank(f);
        if (f.type === 'list') return <ListField key={f.key} field={f} value={v} onChange={(nv) => setField(f.key, nv)} />;
        if (f.type === 'table') return <TableField key={f.key} field={f} value={v} onChange={(nv) => setField(f.key, nv)} />;
        return (
          <div className="field" key={f.key}>
            <label>{f.label}</label>
            {f.type === 'long' ? (
              <textarea rows={4} value={v} placeholder={f.placeholder} onChange={(e) => setField(f.key, e.target.value)} />
            ) : (
              <input type="text" value={v} placeholder={f.placeholder} onChange={(e) => setField(f.key, e.target.value)} />
            )}
          </div>
        );
      })}

      {error && <div className="error" style={{ marginBottom: 10 }}>{error}</div>}

      <div className="nav">
        {step > 0 && (
          <button className="btn ghost" disabled={saving} onClick={() => saveAndGo(-1)}>
            Назад
          </button>
        )}
        <button className="btn" disabled={saving} onClick={() => saveAndGo(1)}>
          {saving ? 'Сохраняю…' : step === schema.length - 1 ? 'Готово' : 'Дальше'}
        </button>
      </div>
    </div>
  );
}
