const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');
const { AGENTS } = require('../agents');

const token = process.env.BOT_TOKEN;
const adminId = process.env.ADMIN_TELEGRAM_ID;

// На Render адрес службы приходит в переменной окружения сам — значит,
// WEBAPP_URL руками задавать не нужно, и не будет расхождения между тем,
// что вписано, и тем, где сервис реально живёт.
const publicUrl = (process.env.WEBAPP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');

/**
 * Как бот получает сообщения.
 *
 * Локально — опросом: своего адреса из интернета нет, Telegram к нам не достучится.
 *
 * В бою — вебхуком: бесплатная служба Render засыпает без запросов, и бот,
 * который сам ходит спрашивать новости, вместе с ней замолкает. Входящий
 * запрос от Telegram службу будит.
 */
const useWebhook = Boolean(publicUrl) && Boolean(process.env.RENDER_EXTERNAL_URL || process.env.USE_WEBHOOK);

let bot = null;
let webhookPath = null;
let webhookSecret = null;

if (!token) {
  // Сервер должен подниматься и без токена: так можно запустить API и фронт,
  // пока бот ещё не создан.
  console.warn('BOT_TOKEN не задан — бот не запущен, работает только API');
} else {
  // Адрес вебхука не должен быть угадываемым, иначе кто угодно сможет
  // присылать нам поддельные сообщения от имени Telegram.
  webhookPath = `/tg/${crypto.createHash('sha256').update(token).digest('hex').slice(0, 24)}`;
  webhookSecret = crypto.createHash('sha256').update(`secret:${token}`).digest('hex').slice(0, 32);

  bot = new TelegramBot(token, useWebhook ? {} : { polling: true });

  if (useWebhook) {
    bot
      .setWebHook(`${publicUrl}${webhookPath}`, { secret_token: webhookSecret })
      .then(() => console.log('вебхук установлен'))
      .catch((err) => console.error('не удалось поставить вебхук:', err.message));
  } else {
    bot.on('polling_error', (err) => console.error('polling:', err.message));
    // Если раньше стоял вебхук, опрос без его снятия работать не будет
    bot.deleteWebHook().catch(() => {});
  }

  bot.onText(/^\/start/, (msg) => {
    const team = AGENTS.map((a) => `• *${a.name}* — ${a.role.toLowerCase()}`).join('\n');
    const text =
      'Это ваша команда:\n\n' +
      team +
      '\n\nСначала расскажите им о своём деле — это один раз и примерно на час. ' +
      'Дальше можно ставить задачи: агенты берут факты из вашего рассказа и ничего не выдумывают.';

    const options = { parse_mode: 'Markdown' };
    if (publicUrl) {
      options.reply_markup = {
        inline_keyboard: [[{ text: 'Открыть команду', web_app: { url: publicUrl } }]],
      };
    }
    bot.sendMessage(msg.chat.id, text, options);
  });
}

/** Разбирает входящий запрос от Telegram. Вешается в server.js. */
function handleWebhook(req, res) {
  if (!bot || !useWebhook) return res.sendStatus(404);
  if (req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret) {
    return res.sendStatus(403);
  }
  bot.processUpdate(req.body);
  res.sendStatus(200);
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
  if (publicUrl) {
    options.reply_markup = {
      inline_keyboard: [[{ text: 'Посмотреть', web_app: { url: publicUrl } }]],
    };
  }
  const text =
    task.status === 'done'
      ? `${who} закончил работу над задачей #${task.id}.`
      : `${who} не смог выполнить задачу #${task.id}. ${task.error || ''}`.trim();
  await bot.sendMessage(ownerId, text, options);
}

module.exports = {
  bot,
  getWebhookPath: () => webhookPath,
  handleWebhook,
  notifyAdminNewTask,
  notifyUserTaskDone,
};
