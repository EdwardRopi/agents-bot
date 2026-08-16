import { useState } from 'react';
import { api, haptic } from './api';
import Markdown from './Markdown.jsx';

const fmt = (iso) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function AgentChat({ agent, tasks, briefReady, onSent, onOpenWizard }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const mine = tasks.filter((t) => t.agent === agent.id);
  const busy = mine.some((t) => t.status === 'new' || t.status === 'running');

  async function send() {
    const prompt = text.trim();
    if (prompt.length < 5 || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.createTask(agent.id, prompt);
      haptic('medium');
      setText('');
      await onSent();
    } catch (err) {
      setError(err.detail ? `${err.message}. ${err.detail}` : err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="chat-head">
        <span className="plate">
          <img src={agent.avatar} alt="" />
        </span>
        <div>
          <h2>{agent.name}</h2>
          <div className="rl">{agent.role}</div>
        </div>
      </div>

      <div className="thread">
        {mine.length === 0 && (
          <div className="bubble theirs">
            <Markdown text={`${agent.tagline}.\n\nЧто я умею:\n${agent.can.map((c) => `- ${c}`).join('\n')}`} />
          </div>
        )}

        {mine.map((t) => (
          <div key={t.id} style={{ display: 'contents' }}>
            <div className="bubble mine">
              {t.prompt}
              <div className="when">{fmt(t.created_at)}</div>
            </div>

            {t.status === 'done' && (
              <div className="bubble theirs">
                <Markdown text={t.result_md} />
                <div className="when">{t.done_at ? fmt(t.done_at) : ''}</div>
              </div>
            )}
            {t.status === 'failed' && (
              <div className="bubble theirs">
                <span className="error">Не получилось выполнить. {t.error}</span>
              </div>
            )}
            {(t.status === 'new' || t.status === 'running') && (
              <div className="bubble pending">
                {t.status === 'new'
                  ? `Задача принята, ${agent.name} возьмётся за неё в рабочее время. Когда закончит — придёт уведомление в Telegram.`
                  : `${agent.name} работает над этим`}
              </div>
            )}
          </div>
        ))}
      </div>

      {!briefReady && agent.needsBrief ? (
        <div className="notice">
          <b>Сначала расскажите о своём деле.</b> Без этого {agent.name} напишет текст про несуществующую компанию —
          все факты берутся из ваших ответов, а не выдумываются.
          <div style={{ marginTop: 10 }}>
            <button className="btn slim" onClick={onOpenWizard}>
              Заполнить
            </button>
          </div>
        </div>
      ) : busy ? (
        <div className="notice">
          {agent.name} ещё занят предыдущей задачей. Как закончит — придёт уведомление в Telegram.
        </div>
      ) : (
        <div className="composer">
          {mine.length === 0 && (
            <div className="examples">
              {agent.examples.map((e) => (
                <button key={e} className="example" onClick={() => setText(e)}>
                  {e}
                </button>
              ))}
            </div>
          )}
          <textarea
            rows={3}
            value={text}
            placeholder={`Что нужно от ${agent.name}?`}
            onChange={(e) => setText(e.target.value)}
          />
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={text.trim().length < 5 || sending} onClick={send}>
            {sending ? 'Отправляю…' : 'Поставить задачу'}
          </button>
        </div>
      )}
    </>
  );
}
