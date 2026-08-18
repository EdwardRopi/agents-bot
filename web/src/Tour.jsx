import { useEffect, useLayoutEffect, useState } from 'react';
import { haptic } from './api';

/**
 * Первое знакомство: подсветка элемента, карточка со стрелкой и «Далее».
 *
 * Порядок шагов идёт не по сетке, а по конвейеру — сначала анкета, потом кто
 * пишет, потом кто проверяет. Человек должен вынести отсюда не список имён,
 * а понимание, что текст доходит до него после проверки, а не первым черновиком.
 */

const AGENT_TEXT = {
  interview:
    'Не хотите заполнять анкету руками — расскажите ей о деле словами. ' +
    'Она разложит по полочкам и спросит только то, чего не хватило.',
  plan:
    'Решает, о чём писать. Не «по календарю», а от задач дела: что мешает людям ' +
    'к вам прийти — про то и текст.',
  smm:
    'Пишет посты, статьи, рассылки и заголовки. Все факты берёт из вашей анкеты ' +
    'и ничего не придумывает от себя.',
  editor:
    'Проверяет за Асей каждый факт и не даёт публиковать выдумки. ' +
    'Текст доходит до вас после её проверки, а не первым черновиком.',
  reply:
    'Отвечает на отзывы — в том числе на злые — и собирает «вопросы и ответы». ' +
    'Пишет так, чтобы хорошо выглядело для тех, кто читает со стороны.',
  leads:
    'Разбирает заявки с сайта: сколько настоящих, кому не перезвонили, ' +
    'какие уведомления не дошли.',
  advisor:
    'С ней обсуждают, как поступить: в каком порядке выкладывать ролики, ' +
    'как построить мастер-класс, что говорить в холодном звонке. ' +
    'Отвечает решением, а не списком вариантов.',
};

/** Порядок рассказа — по ходу работы, а не по расположению карточек. */
const ORDER = ['interview', 'advisor', 'plan', 'smm', 'editor', 'reply', 'leads'];

function buildSteps(agents) {
  const byId = Object.fromEntries(agents.map((a) => [a.id, a]));

  const agentSteps = ORDER.filter((id) => byId[id]).map((id) => ({
    target: `[data-tour="agent-${id}"]`,
    title: `${byId[id].name} — ${byId[id].role.toLowerCase()}`,
    body: AGENT_TEXT[id] || byId[id].tagline,
  }));

  return [
    {
      target: '[data-tour="roster"]',
      title: 'Это ваша команда',
      body: `${agents.length} агентов, каждый занят своим делом. За минуту покажу, кто чем — или пропустите, если хотите разобраться сами.`,
    },
    {
      target: '[data-tour="brief"]',
      title: 'Сначала анкета о вашем деле',
      body: 'Это фундамент. Агенты берут факты только оттуда — поэтому не выдумывают ни цен, ни сроков, ни опыта, которого у вас нет.',
    },
    ...agentSteps,
    {
      target: null,
      title: 'Как поставить задачу',
      body: 'Откройте нужного агента и напишите своими словами, что нужно. Ответ придёт сюда же и отдельным уведомлением в Telegram.',
    },
  ];
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const PAD = 6; // на сколько подсветка выступает за края элемента

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

  // Пока идёт обучение, системная «назад» должна закрывать его, а не уводить
  // на предыдущий экран — иначе тур останется висеть поверх чужой страницы.
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

  const next = () => {
    haptic();
    if (last) onClose();
    else setI(i + 1);
  };

  // Карточка прижимается либо под цель, либо над ней — смотря где есть место.
  // Так не нужно заранее знать её высоту.
  const below = rect ? rect.bottom + 190 < window.innerHeight : true;
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
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}

      <div className="tour-card" style={cardStyle}>
        {rect && (
          <span className={`tour-arrow ${below ? 'up' : 'down'}`} style={{ left: arrowLeft }} />
        )}
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-nav">
          <button className="tour-skip" onClick={onClose}>
            Пропустить обучение
          </button>
          <span className="tour-step">
            {i + 1} / {steps.length}
          </span>
          <button className="btn slim" onClick={next}>
            {last ? 'Понятно' : 'Далее'}
          </button>
        </div>
      </div>
    </div>
  );
}
