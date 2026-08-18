import { useEffect, useState } from 'react';
import { api, haptic, payWithStars } from './api';

/**
 * Экран тарифов.
 *
 * Главное решение: человек должен с первого взгляда понять, сколько задач
 * он сможет ставить. Поэтому крупной строкой в каждой карточке — не цена
 * и не список возможностей, а «задача каждый день».
 */
export default function Tariffs({ onChanged }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const load = () => api.billing().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function buy(plan) {
    setBusy(plan);
    setError(null);
    try {
      const { link } = await api.invoice(plan);
      const status = await payWithStars(link);
      if (status === 'paid') {
        haptic('medium');
        // Тариф включает сервер по событию от Telegram, и оно может прийти
        // на секунду позже, чем закроется окно оплаты. Поэтому перечитываем
        // не сразу.
        setTimeout(() => { load(); onChanged(); }, 1500);
      }
    } catch (err) {
      setError(err.detail ? `${err.message}. ${err.detail}` : err.message);
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) return <div className="notice"><span className="error">{error}</span></div>;
  if (!data) return <p style={{ color: 'var(--muted)' }}>Загружаю тарифы…</p>;

  const cur = data.current;

  return (
    <>
      <div className="topbar">
        <h1>Тарифы</h1>
      </div>

      <div className="notice">
        <b>Сейчас: {cur.planName}.</b>{' '}
        {cur.plan === 'free'
          ? 'Три задачи, чтобы посмотреть, как работает команда.'
          : cur.until
            ? `Действует до ${new Date(cur.until).toLocaleDateString('ru-RU')}.`
            : ''}
        <div style={{ marginTop: 6 }}>
          Осталось {cur.period.left} из {cur.period.limit}
          {' · '}сегодня {cur.day.left} из {cur.day.limit}
        </div>
      </div>

      {data.tariffs.map((t) => {
        const active = cur.plan === t.id && !cur.expired;
        return (
          <div key={t.id} className={`plan${active ? ' on' : ''}`}>
            <div className="plan-head">
              <span className="plan-name">{t.name}</span>
              <span className="plan-price">{t.stars.toLocaleString('ru-RU')} ⭐</span>
            </div>
            <div className="plan-pitch">{t.pitch}</div>
            <ul className="plan-lines">
              {t.lines.map((l) => <li key={l}>{l}</li>)}
            </ul>
            <div className="plan-note">{t.note}</div>
            {active ? (
              <div className="plan-active">Ваш тариф</div>
            ) : (
              <button className="btn" disabled={busy === t.id} onClick={() => buy(t.id)}>
                {busy === t.id ? 'Открываю оплату…' : `Подключить за ${t.stars.toLocaleString('ru-RU')} ⭐`}
              </button>
            )}
          </div>
        );
      })}

      {error && <div className="error">{error}</div>}

      <p className="plan-foot">
        Задача — это одно обращение к любому агенту. Текст всегда проходит проверку
        редактора, и это считается одной задачей, а не двумя.
      </p>
    </>
  );
}
