import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import Room from './Room.jsx';
import AgentChat from './AgentChat.jsx';
import BriefWizard from './BriefWizard.jsx';
import Tour from './Tour.jsx';
import Tariffs from './Tariffs.jsx';

/** Версия в ключе — чтобы при переделке тура его увидели и старые клиенты. */
const TOUR_KEY = 'tour_v1';

export default function App() {
  const [me, setMe] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [briefSections, setBriefSections] = useState(null);
  const [screen, setScreen] = useState({ name: 'room' });
  const [fatal, setFatal] = useState(null);
  const [tour, setTour] = useState(false);

  const loadTasks = useCallback(async () => {
    const { tasks } = await api.tasks();
    setTasks(tasks);
  }, []);

  // useCallback здесь не украшение: тур подписывается на системную «назад»
  // по этой функции, и новая ссылка на каждый рендер дёргала бы подписку
  // каждые 15 секунд, пока опрашивается очередь.
  const closeTour = useCallback(() => {
    setTour(false);
    try {
      localStorage.setItem(TOUR_KEY, '1');
    } catch {
      /* приватный режим — обойдёмся */
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const profile = await api.me();
        setMe(profile);
        // Обучение показываем один раз и только тем, кто его ещё не видел.
        // localStorage может быть недоступен — тогда просто не показываем,
        // молча падать на первом же экране приложение не должно.
        try {
          if (!localStorage.getItem(TOUR_KEY)) setTour(true);
        } catch {
          /* приватный режим — обойдёмся */
        }
        await loadTasks();
      } catch (err) {
        setFatal(err.payload?.error === 'need_invite' ? { invite: true, text: err.detail } : { text: err.message });
      }
    })();
  }, [loadTasks]);

  // Пока агент занят, подглядываем за очередью: результат приходит не сразу,
  // и человек не должен закрывать-открывать приложение, чтобы его увидеть.
  useEffect(() => {
    const waiting = tasks.some((t) => t.status === 'new' || t.status === 'running');
    if (!waiting) return undefined;
    const id = setInterval(() => {
      loadTasks().catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [tasks, loadTasks]);

  // Системная кнопка «назад» Telegram вместо своей стрелки в углу
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.BackButton) return undefined;
    const back = () => setScreen({ name: 'room' });
    if (screen.name === 'room') {
      tg.BackButton.hide();
    } else {
      tg.BackButton.show();
      tg.onEvent('backButtonClicked', back);
    }
    return () => tg.offEvent('backButtonClicked', back);
  }, [screen]);

  if (fatal) {
    return (
      <div className="center">
        <div>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>
            {fatal.invite ? 'Нужно приглашение' : 'Не удалось открыть команду'}
          </p>
          <p style={{ color: 'var(--muted)', fontSize: 14, maxWidth: '30ch' }}>
            {!api.hasInitData
              ? 'Это приложение открывается из Telegram — через бота.'
              : fatal.text || 'Попробуйте ещё раз через минуту.'}
          </p>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="center">
        <p style={{ color: 'var(--muted)' }}>Собираем команду…</p>
      </div>
    );
  }

  const openWizard = async () => {
    const data = await api.brief();
    setBriefSections(data.sections || {});
    setScreen({ name: 'wizard' });
  };

  return (
    <div className="app">
      {screen.name === 'room' && (
        <Room
          me={me}
          tasks={tasks}
          onOpenAgent={(id) => setScreen({ name: 'chat', agentId: id })}
          onOpenWizard={openWizard}
          onReplayTour={() => setTour(true)}
          onOpenTariffs={() => setScreen({ name: 'tariffs' })}
        />
      )}

      {screen.name === 'tariffs' && (
        <Tariffs onChanged={async () => setMe(await api.me())} />
      )}

      {tour && screen.name === 'room' && <Tour agents={me.agents} onClose={closeTour} />}

      {screen.name === 'chat' && (
        <AgentChat
          agent={me.agents.find((a) => a.id === screen.agentId)}
          tasks={tasks}
          briefReady={me.brief.progress.ready}
          onSent={async () => {
            await loadTasks();
            setMe(await api.me()); // счётчик остатка должен обновиться сразу
          }}
          onOpenWizard={openWizard}
          onOpenTariffs={() => setScreen({ name: 'tariffs' })}
        />
      )}

      {screen.name === 'wizard' && (
        <BriefWizard
          schema={me.brief.schema}
          sections={briefSections}
          onSaved={(progress) => setMe({ ...me, brief: { ...me.brief, progress } })}
          onDone={() => setScreen({ name: 'room' })}
        />
      )}
    </div>
  );
}
