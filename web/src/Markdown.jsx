/**
 * Маленький разборщик markdown. Агенты присылают заголовки, списки, жирный
 * и разделители — этого хватает, а тащить библиотеку ради четырёх правил
 * в мини-апп, который грузится по мобильному интернету, не стоит.
 *
 * Текст никогда не вставляется как HTML: всё собирается реактовскими узлами,
 * поэтому подставить разметку через результат агента невозможно.
 */

function inline(text, keyPrefix) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={`${keyPrefix}-b${i++}`}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<code key={`${keyPrefix}-c${i++}`}>{token.slice(1, -1)}</code>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function Markdown({ text }) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let list = null;
  let para = [];

  const flushPara = () => {
    if (para.length) {
      const key = `p${blocks.length}`;
      blocks.push(<p key={key}>{inline(para.join(' '), key)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(<ul key={`u${blocks.length}`}>{list}</ul>);
      list = null;
    }
  };

  lines.forEach((raw) => {
    const line = raw.trimEnd();

    if (line.trim() === '') {
      flushPara();
      flushList();
      return;
    }
    if (/^---+$/.test(line.trim())) {
      flushPara();
      flushList();
      blocks.push(<hr key={`h${blocks.length}`} />);
      return;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      const key = `t${blocks.length}`;
      blocks.push(<h3 key={key}>{inline(heading[2], key)}</h3>);
      return;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!list) list = [];
      const key = `l${blocks.length}-${list.length}`;
      list.push(<li key={key}>{inline(bullet[1], key)}</li>);
      return;
    }
    flushList();
    para.push(line.trim());
  });

  flushPara();
  flushList();

  return <div className="md">{blocks}</div>;
}
