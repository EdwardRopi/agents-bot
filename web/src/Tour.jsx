import { useEffect, useLayoutEffect, useState } from 'react';
import { haptic } from './api';

/**
 * Первое знакомство: подсветка элемента, карточка со стрелкой и «Далее».
 *
 * Порядок шагов идёт не по сетке, а по ходу работы — сначала анкета, потом
 * руководитель, потом исполнители. Человек должен вынести отсюда две вещи:
 * что к любому можно обратиться напрямую, а если не знаешь к кому — есть Марк;
 * и что текст доходит до него после проверки, а не первым черновиком.
 */

const AGENT_TEXT = {
  manager:
    'Не знаете, к кому идти, — напишите ему своими словами: «нужен текст про новый набор» ' +
    'или «заявок стало меньше, что делать». Он разберёт задачу, передаст тому, кто её сделает, ' +
    'и скажет прямо, если она не наша.',
  interview:
    'Не хотите заполнять анкету руками — расскажите ей о деле словами. ' +
    'Она разложит по полочкам и спросит только то, чего не хватило.',
  advisor:
    'С ней обсуждают, как поступить: в каком порядке выкладывать ролики, ' +
    'как построить мастер-класс, что говорить в холодном звонке. ' +
    'Отвечает решением, а не списком вариантов.',
  plan:
    'Решает, о чём писать. Не «по календарю», а от задач дела: что мешает людям ' +
    'к вам прийти — про то и текст.',
  smm:
    'Пишет посты, статьи, рассылки и заголовки. Все факты берёт из вашей анкеты ' +
    'и ничего не придумывает от себя.',
  editor:
    'Проверяет за Асей каждый факт и не даёт публиковать выдумки. ' +
    'Ни один текст не уходит к вам, минуя её, — поэтому вы получаете проверенное, ' +
    'а не первый черновик.',
  reply:
    'Отвечает на отзывы — в том числе на злые — и собирает «вопросы и ответы». ' +
    'Пишет так, чтобы хорошо выглядело для тех, кто читает со стороны.',
  leads:
    'Разбирает заявки с сайта: сколько настоящих, кому не перезвонили, ' +
    'какие уведомления не дошли.',
};

/**
 * Порядок рассказа — по ходу работы, а не по расположению карточек.
 * Руководитель идёт первым: если человек перестанет вчитываться на третьем
 * шаге, он всё равно унесёт главное — есть тот, кому можно написать не разбираясь.
 */
const ORDER = ['manager', 'interview', 'advisor', 'plan', 'smm', 'editor', 'reply', 'leads'];

function buildSteps(agents) {
  const byId = Object.fromEntries(agents.map((a) => [a.id, a]));

  const agentSteps = ORDER.filter((id) => byId[id]).map((id) => {
    const a = byId[id];
    return {
      target: `[data-tour="agent-${id}"]`,
      title: a.name,
      subtitle: a.role,
      avatar: a.avatar,
      accent: a.accent,
      body: AGENT_TEXT[id] || a.tagline,
    };
  });

  return [
    {
      target: '[data-tour="roster"]',
      title: 'Это ваша команда',
      body:
        `${agents.length} агентов, каждый занят своим делом. Обратиться можно двумя способами: ` +
        'открыть нужного и написать напрямую — или, если не знаете кого, написать руководителю. ' +
        'Дальше покажу каждого.',
    },
    {
      target: '[data-tour="brief"]',
      title: 'Сначала анкета о вашем деле',
      body:
        'Это фундамент. Агенты берут факты только оттуда — поэтому не выдумывают ни цен, ' +
        'ни сроков, ни опыта, которого у вас нет. Заполняется один раз, потом только дополняется.',
    },
    ...agentSteps,
    {
      target: '[data-tour="roster"]',
      title: 'С чего начать',
      body:
        'Заполните анкету — сами или через Полину. Потом откройте нужного агента, ' +
        'а если не знаете кого — Марка, и напишите своими словами. ' +
        'Готовый ответ придёт сюда же и отдельным уведомлением в Telegram.',
    },
  ];
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const PAD = 6; // на сколько подсветка выступает за края элемента
const CARD_H = 250; // прикидка высоты карточки — нужна только чтобы выбрать сторону

export default function Tour({ agents, onClose }) {
  const steps = buildSteps(agents);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);

  const step = steps[i];
  const last = i === steps.length - 1;

  // Сначала подводим цель к центру экрана, и только потом меряем: если мерить
  // до прокрутки, подсветка встанет там, где элемент был, а не где он стал.
  useLayoutEffect(() => {
    if (!step.target) {
      setRect(null);
      return undefined;
    }
    const el = document.querySelector(step.target);
    if (!el) {
      setRect(null);
      return undefined;
    }

    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    const measure = () => setRect(el.getBoundingClientRect());
    const raf = requestAnimationFrame(measure);

    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [i, step.target]);

  // Кнопки «пропустить» нет, поэтому системная «назад» — единственный выход.
  // Она должна закрывать обучение, а не уводить на предыдущий экран, иначе тур
  // останется висеть поверх чужой страницы.
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.BackButton) return undefined;
    tg.BackButton.show();
    tg.onEvent('backButtonClicked', onClose);
    return () => {
      tg.offEvent('backButtonClicked', onClose);
      tg.BackButton.hide();
    };
  }, [onClose]);

  const go = (delta) => {
    haptic();
    if (last && delta > 0) onClose();
    else setI(clamp(i + delta, 0, steps.length - 1));
  };

  // Карточка прижимается либо под цель, либо над ней — смотря где есть место.
  const below = rect ? rect.bottom + CARD_H < window.innerHeight : true;
  let cardStyle = { top: '50%', transform: 'translateY(-50%)' };
  if (rect) {
    cardStyle = below
      ? { top: Math.round(rect.bottom + PAD + 14) }
      : { bottom: Math.round(window.innerHeight - rect.top + PAD + 14) };
  }

  let arrowLeft = null;
  if (rect) {
    const cardW = Math.min(420, window.innerWidth - 24);
    const cardLeft = (window.innerWidth - cardW) / 2;
    arrowLeft = clamp(rect.left + rect.width / 2 - cardLeft - 9, 16, cardW - 34);
  }

  // Тонкая обводка цветом агента: подсказывает, что подсвечено именно его лицо.
  const holeShadow = step.accent
    ? `0 0 0 2px ${step.accent}, 0 0 0 9999px rgba(12, 10, 8, 0.74)`
    : '0 0 0 9999px rgba(12, 10, 8, 0.74)';

  return (
    <div className="tour">
      {rect ? (
        <div
          className="tour-hole"
          style={{
            top: Math.round(rect.top - PAD),
            left: Math.round(rect.left - PAD),
            width: Math.round(rect.width + PAD * 2),
            height: Math.round(rect.height + PAD * 2),
            boxShadow: holeShadow,
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}

      <div className="tour-card" style={cardStyle}>
        {rect && (
          <span className={`tour-arrow ${below ? 'up' : 'down'}`} style={{ left: arrowLeft }} />
        )}

        <div className="tour-dots">
          {steps.map((s, k) => (
            <i key={k} className={k <= i ? 'on' : ''} />
          ))}
        </div>

        <div className="tour-in" key={i}>
          {step.avatar ? (
            <div className="tour-who">
              <span className="plate">
                <img src={step.avatar} alt="" />
              </span>
              <div>
                <h3>{step.title}</h3>
                <div className="tour-role">{step.subtitle}</div>
                <span className="tour-accent" style={{ background: step.accent }} />
              </div>
            </div>
          ) : (
            <h3 className="tour-lead">{step.title}</h3>
          )}
          <p>{step.body}</p>
        </div>

        <div className="tour-nav">
          {i > 0 ? (
            <button className="btn ghost slim" onClick={() => go(-1)}>
              Назад
            </button>
          ) : (
            <span />
          )}
          <button className="btn slim" onClick={() => go(1)}>
            {last ? 'Начать работу' : 'Далее'}
          </button>
        </div>
      </div>
    </div>
  );
}
