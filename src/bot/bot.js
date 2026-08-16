const TelegramBot = require('node-telegram-bot-api');
const { AGENTS } = require('../agents');

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEBAPP_URL;
const adminId = process.env.ADMIN_TELEGRAM_ID;

let bot = null;

if (!token) {
  // Сервер должен подниматься и без токена: так можно запустить API и фронт
  // локально, пока бот ещё не создан.
  console.warn('BOT_TOKEN не задан — бот не запущен, работает только API');
} else {
  bot = new TelegramBot(token, { polling: true });

  bot.on('polling_error', (err) => {
    console.error('polling:', err.message);
  });

  bot.onText(/^\/start/, (msg) => {
    const team = AGENTS.map((a) => `• *${a.name}* — ${a.role.toLowerCase()}`).join('\n');
    const text =
      'Это ваша команда:\n\n' +
      team +
      '\n\nСначала расскажите им о своём бизнесе — это займёт около часа и делается один раз. ' +
      'После этого можно ставить задачи: агенты берут факты из вашего брифа и ничего не выдумывают.';

    const options = { parse_mode: 'Markdown' };
    if (webAppUrl) {
      options.reply_markup = {
        inline_keyboard: [[{ text: 'Открыть команду', web_app: { url: webAppUrl } }]],
      };
    }
    bot.sendMessage(msg.chat.id, text, options);
  });
}

/** Сообщает владельцу сервиса, что в очереди появилась работа. */
async function notifyAdminNewTask(task, workspace) {
  if (!bot || !adminId) return;
  const agent = AGENTS.find((a) => a.id === task.agent);
  const preview = task.prompt.length > 300 ? `${task.prompt.slice(0, 300)}…` : task.prompt;
  await bot.sendMessage(
    adminId,
    `Новая задача #${task.id}\n${workspace.name} → ${agent ? agent.name : task.agent}\n\n${preview}`
  );
}

/** Сообщает клиенту, что агент закончил. */
async function notifyUserTaskDone(ownerId, task) {
  if (!bot) return;
  const agent = AGENTS.find((a) => a.id === task.agent);
  const who = agent ? agent.name : task.agent;
  const options = {};
  if (webAppUrl) {
    options.reply_markup = {
      inline_keyboard: [[{ text: 'Посмотреть', web_app: { url: webAppUrl } }]],
    };
  }
  const text =
    task.status === 'done'
      ? `${who} закончил работу над задачей #${task.id}.`
      : `${who} не смог выполнить задачу #${task.id}. ${task.error || ''}`.trim();
  await bot.sendMessage(ownerId, text, options);
}

module.exports = { bot, notifyAdminNewTask, notifyUserTaskDone };
