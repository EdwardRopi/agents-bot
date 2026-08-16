import { haptic } from './api';

const STATUS_LABEL = {
  new: 'в очереди',
  running: 'работает',
  done: 'готово',
  failed: 'не вышло',
};

export default function Room({ me, tasks, onOpenAgent, onOpenWizard }) {
  const { workspace, brief, agents, host } = me;
  const ready = brief.progress.ready;

  // Кто чем занят прямо сейчас — чтобы значок «работает» стоял на карточке
  const busyBy = {};
  tasks.forEach((t) => {
    if (t.status === 'new' || t.status === 'running') busyBy[t.agent] = t.status;
  });

  const recent = [...tasks].reverse().slice(0, 5);
  const agentById = Object.fromEntries(agents.map((a) => [a.id, a]));

  return (
    <>
      <div className="topbar">
        <h1>{workspace.name}</h1>
        <span className={`chip${ready ? ' ready' : ''}`}>
          {ready ? 'бриф готов' : `бриф ${brief.progress.done}/${brief.progress.total}`}
        </span>
      </div>

      {!ready && (
        <div className="host">
          <span className="plate">
            <img src={host.avatar} alt="" />
          </span>
          <div className="host-body">
            <h2>{host.name}</h2>
            <div className="who">{host.role}</div>
            <p>{host.greeting}</p>
            <button
              className="btn"
              onClick={() => {
                haptic('medium');
                onOpenWizard();
              }}
            >
              Рассказать о деле
            </button>
          </div>
        </div>
      )}

      <p className="section-title">Команда</p>
      <div className="roster">
        {agents.map((a) => (
          <button
            key={a.id}
            className="agent"
            onClick={() => {
              haptic();
              onOpenAgent(a.id);
            }}
          >
            <span className="plate">
              <img src={a.avatar} alt="" />
            </span>
            <span className="accent-bar" style={{ background: a.accent }} />
            <span className="nm">{a.name}</span>
            <span className="rl">{a.role}</span>
            {busyBy[a.id] && <span className="badge">{STATUS_LABEL[busyBy[a.id]]}</span>}
          </button>
        ))}
      </div>

      {ready && (
        <button className="btn ghost" onClick={onOpenWizard}>
          Настройки бизнеса
        </button>
      )}

      {recent.length > 0 && (
        <>
          <p className="section-title">Последние работы</p>
          <div className="feed">
            {recent.map((t) => {
              const a = agentById[t.agent];
              return (
                <button key={t.id} className="feed-item" onClick={() => onOpenAgent(t.agent)}>
                  <span className="plate mini">{a && <img src={a.avatar} alt="" />}</span>
                  <span className="txt">
                    <span className="t1">{t.prompt}</span>
                    <span className="t2">
                      {a ? a.name : t.agent} · {STATUS_LABEL[t.status] || t.status}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
