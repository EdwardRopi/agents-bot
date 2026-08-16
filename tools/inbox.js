#!/usr/bin/env node
/**
 * Локальный раннер: забирает задачи из очереди сервиса и отдаёт результаты.
 *
 * Пока нет ключа к API, «мозгом» работает Claude Code на этой машине:
 * скрипт только носит данные туда-обратно, а сами тексты пишут агенты
 * smm / editor / leads по своим инструкциям из .claude\agents\.
 *
 * Команды:
 *   node tools/inbox.js list                    что ждёт работы
 *   node tools/inbox.js show <id>               задача целиком + бриф в markdown
 *   node tools/inbox.js claim <id>              взять в работу
 *   node tools/inbox.js result <id> <файл.md>   отдать результат
 *   node tools/inbox.js fail <id> "причина"     отметить, что не вышло
 */
require('dotenv').config();
const fs = require('fs');

const BASE = (process.env.RUNNER_API_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.RUNNER_TOKEN;

if (!BASE || !TOKEN) {
  console.error('Не заданы RUNNER_API_URL или RUNNER_TOKEN в .env');
  process.exit(1);
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-runner-token': TOKEN,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${res.status}: ${data.error || text}`);
  }
  return data;
}

/** Превращает бриф из базы в markdown, который агент читает как файл. */
function briefToMarkdown(brief) {
  if (!brief || Object.keys(brief).length === 0) return '_Бриф пуст._';
  const lines = [];
  for (const [sectionId, value] of Object.entries(brief)) {
    lines.push(`## ${sectionId}`);
    for (const [key, field] of Object.entries(value || {})) {
      if (Array.isArray(field)) {
        if (field.length === 0) continue;
        lines.push(`**${key}:**`);
        for (const item of field) {
          lines.push(typeof item === 'object' ? `- ${JSON.stringify(item)}` : `- ${item}`);
        }
      } else if (field !== null && field !== undefined && String(field).trim() !== '') {
        lines.push(`**${key}:** ${field}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

const [, , cmd, ...args] = process.argv;

(async () => {
  if (cmd === 'list') {
    const { tasks } = await api('/runner/tasks');
    if (tasks.length === 0) {
      console.log('Очередь пуста');
      return;
    }
    for (const t of tasks) {
      const when = new Date(t.created_at).toLocaleString('ru-RU');
      console.log(`#${t.id}  ${t.agent.padEnd(7)}  ${t.workspace_name}  ${when}`);
      console.log(`        ${t.prompt.slice(0, 100).replace(/\s+/g, ' ')}`);
    }
    return;
  }

  if (cmd === 'show') {
    const { tasks } = await api('/runner/tasks?status=new');
    const running = await api('/runner/tasks?status=running');
    const all = [...tasks, ...running.tasks];
    const task = all.find((t) => String(t.id) === String(args[0]));
    if (!task) {
      console.error('Такой задачи в очереди нет');
      process.exit(1);
    }
    console.log(`# Задача #${task.id}`);
    console.log(`Агент: ${task.agent}`);
    console.log(`Клиент: ${task.workspace_name} (workspace ${task.workspace_id})`);
    console.log(`\n## Что просят\n\n${task.prompt}`);
    console.log(`\n## Бриф клиента\n\n${briefToMarkdown(task.brief)}`);
    return;
  }

  if (cmd === 'claim') {
    await api(`/runner/tasks/${args[0]}/claim`, { method: 'POST' });
    console.log(`Задача #${args[0]} взята в работу`);
    return;
  }

  if (cmd === 'result') {
    const file = args[1];
    if (!file || !fs.existsSync(file)) {
      console.error('Укажи существующий файл с результатом');
      process.exit(1);
    }
    const result_md = fs.readFileSync(file, 'utf8');
    await api(`/runner/tasks/${args[0]}/result`, {
      method: 'POST',
      body: JSON.stringify({ result_md }),
    });
    console.log(`Результат по задаче #${args[0]} отправлен, клиент получил уведомление`);
    return;
  }

  if (cmd === 'fail') {
    await api(`/runner/tasks/${args[0]}/fail`, {
      method: 'POST',
      body: JSON.stringify({ error: args[1] || 'Не удалось выполнить' }),
    });
    console.log(`Задача #${args[0]} отмечена как невыполненная`);
    return;
  }

  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].split('/**')[1]);
})().catch((err) => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
