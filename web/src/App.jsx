import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import Room from './Room.jsx';
import AgentChat from './AgentChat.jsx';
import BriefWizard from './BriefWizard.jsx';

export default function App() {
  const [me, setMe] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [briefSections, setBriefSections] = useState(null);
  const [screen, setScreen] = useState({ name: 'room' });
  const [fatal, setFatal] = useState(null);

  const loadTasks = useCallback(async () => {
    const { tasks } = await api.tasks();
    setTasks(tasks);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const profile = await api.me();
        setMe(profile);
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
        />
      )}

      {screen.name === 'chat' && (
        <AgentChat
          agent={me.agents.find((a) => a.id === screen.agentId)}
          tasks={tasks}
          briefReady={me.brief.progress.ready}
          onSent={loadTasks}
          onOpenWizard={openWizard}
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
