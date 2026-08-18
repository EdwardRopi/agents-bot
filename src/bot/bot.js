const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');
const pool = require('../db/pool');
const { AGENTS } = require('../agents');
const { isAdmin, createInvite, redeemInvite } = require('../access');

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
let botUsername = null;

const openButton = () =>
  publicUrl ? { inline_keyboard: [[{ text: 'Открыть команду', web_app: { url: publicUrl } }]] } : undefined;

function teamText(workspaceName) {
  const team = AGENTS.map((a) => `• *${a.name}* — ${a.role.toLowerCase()}`).join('\n');
  return (
    (workspaceName ? `Пространство «${workspaceName}» готово.\n\n` : '') +
    'Это ваша команда:\n\n' +
    team +
    '\n\nСначала расскажите им о своём деле — это один раз и примерно на час. ' +
    'Дальше можно ставить задачи: агенты берут факты из вашего рассказа и ничего не выдумывают.'
  );
}

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

  bot
    .getMe()
    .then((me) => {
      botUsername = me.username;
    })
    .catch(() => {});

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

  // /start [код приглашения]
  bot.onText(/^\/start(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    const code = match[1];

    try {
      if (isAdmin(user.id)) {
        return bot.sendMessage(chatId, teamText(null), { parse_mode: 'Markdown', reply_markup: openButton() });
      }

      if (code) {
        const label = await redeemInvite(code, user);
        if (label) {
          return bot.sendMessage(chatId, teamText(label), { parse_mode: 'Markdown', reply_markup: openButton() });
        }
        return bot.sendMessage(
          chatId,
          'Эта ссылка уже использована или недействительна. Попросите новую у того, кто вас позвал.'
        );
      }

      const { rows } = await pool.query('SELECT status FROM users WHERE telegram_id = $1', [user.id]);
      if (rows[0] && rows[0].status === 'active') {
        return bot.sendMessage(chatId, teamText(null), { parse_mode: 'Markdown', reply_markup: openButton() });
      }

      return bot.sendMessage(
        chatId,
        'Команда работает по приглашению. Если вам её рекомендовали — попросите ссылку-приглашение, она открывает доступ в одно нажатие.'
      );
    } catch (err) {
      console.error('/start:', err.message);
      bot.sendMessage(chatId, 'Что-то пошло не так. Попробуйте ещё раз через минуту.');
    }
  });

  // /invite Название бизнеса — только для владельца сервиса
  bot.onText(/^\/invite(?:\s+([\s\S]+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAdmin(msg.from.id)) return;

    const label = (match[1] || '').trim();
    if (!label) {
      return bot.sendMessage(chatId, 'Как пользоваться: /invite Название бизнеса\nНапример: /invite Киноцех личности');
    }

    try {
      const invite = await createInvite(label);
      const link = botUsername
        ? `https://t.me/${botUsername}?start=${invite.code}`
        : `код: ${invite.code}`;
      await bot.sendMessage(
        chatId,
        `Приглашение для «${label}» готово. Ссылка одноразовая:\n\n${link}`,
        { disable_web_page_preview: true }
      );
    } catch (err) {
      console.error('/invite:', err.message);
      bot.sendMessage(chatId, 'Не получилось создать приглашение.');
    }
  });

  // /invites — что выдано и кем использовано
  bot.onText(/^\/invites/, async (msg) => {
    if (!isAdmin(msg.from.id)) return;
    try {
      const { rows } = await pool.query(
        `SELECT i.code, i.label, i.uses, i.max_uses,
                (SELECT string_agg(COALESCE('@' || u.username, u.first_name), ', ')
                   FROM users u WHERE u.invited_by = i.code) AS who
           FROM invites i ORDER BY i.created_at DESC LIMIT 20`
      );
      if (rows.length === 0) return bot.sendMessage(msg.chat.id, 'Приглашений пока нет.');
      const list = rows
        .map((r) => `«${r.label}» — ${r.uses}/${r.max_uses}${r.who ? ` · ${r.who}` : ' · не использовано'}`)
        .join('\n');
      bot.sendMessage(msg.chat.id, list);
    } catch (err) {
      console.error('/invites:', err.message);
    }
  });
}

// ---------------------------------------------------------------------------
// Оплата звёздами
// ---------------------------------------------------------------------------

if (bot) {
  // Ответить надо за 10 секунд, иначе Telegram отменит платёж сам.
  bot.on('pre_checkout_query', async (query) => {
    try {
      const ok = /^plan:[a-z]+:\d+$/.test(query.invoice_payload || '');
      await bot.answerPreCheckoutQuery(query.id, ok, ok ? undefined : { error_message: 'Счёт устарел, откройте тарифы заново' });
    } catch (err) {
      console.error('pre_checkout:', err.message);
    }
  });

  /**
   * Единственное место, где включается тариф.
   *
   * Колбэк openInvoice во фронте для этого не годится: он приходит в браузер
   * клиента, а браузер клиента подделывается за пять минут. Это событие
   * приходит от Telegram на сервер, и подделать его нельзя.
   */
  bot.on('successful_payment', async (msg) => {
    const p = msg.successful_payment;
    const telegramId = msg.from.id;
    try {
      const { getTariff } = require('../tariffs');
      const { activate } = require('../limits');
      const planId = String(p.invoice_payload || '').split(':')[1];
      const tariff = getTariff(planId);

      // Уникальность charge_id — защита от повторной доставки события.
      // Без неё клиент получил бы два периода за одну оплату.
      const ins = await pool.query(
        `INSERT INTO payments (telegram_id, charge_id, plan, stars, is_recurring)
              VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (charge_id) DO NOTHING
         RETURNING id`,
        [telegramId, p.telegram_payment_charge_id, planId, p.total_amount, Boolean(p.is_recurring)]
      );
      if (ins.rows.length === 0) return; // уже обработали

      await activate(telegramId, tariff);

      const until = p.subscription_expiration_date
        ? new Date(p.subscription_expiration_date * 1000).toLocaleDateString('ru-RU')
        : new Date(Date.now() + tariff.days * 86400000).toLocaleDateString('ru-RU');

      await bot.sendMessage(
        telegramId,
        `Тариф «${tariff.name}» включён до ${until}.\n\n` +
          `${tariff.perDay} ${tariff.perDay === 1 ? 'задача' : 'задачи'} в день, до ${tariff.perPeriod} за период. ` +
          'Команда ждёт работы.',
        { reply_markup: openButton() }
      );
    } catch (err) {
      console.error('successful_payment:', err.message);
      // Деньги списаны, а тариф не включился — это надо видеть сразу.
      if (adminId) {
        bot.sendMessage(adminId, `ОПЛАТА НЕ ПРОШЛА ДО КОНЦА: ${telegramId}, ${p.total_amount} XTR, ${err.message}`).catch(() => {});
      }
    }
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
  const text =
    task.status === 'done'
      ? `${who} закончил работу над задачей #${task.id}.`
      : `${who} не смог выполнить задачу #${task.id}. ${task.error || ''}`.trim();
  await bot.sendMessage(ownerId, text, { reply_markup: openButton() });
}

/** Ссылка на счёт в звёздах. Без бота её создать невозможно. */
async function createInvoiceLink(title, description, payload, providerToken, currency, prices, extra = {}) {
  if (!bot) throw new Error('Бот не запущен: нет BOT_TOKEN');
  return bot.createInvoiceLink(title, description, payload, providerToken, currency, prices, extra);
}

module.exports = {
  bot,
  getWebhookPath: () => webhookPath,
  handleWebhook,
  notifyAdminNewTask,
  notifyUserTaskDone,
  createInvoiceLink,
};
