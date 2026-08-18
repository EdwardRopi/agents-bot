const pool = require('./db/pool');
const { getTariff } = require('./tariffs');

/**
 * Лимиты подписки.
 *
 * Главное правило: остаток проверяется ПРИ ПОСТАНОВКЕ задачи, а не в середине
 * работы. Если лимит кончится между Асей и Верой, клиент получит непроверенный
 * текст — то есть ровно то, ради чего весь конвейер и существует.
 *
 * Второе: списывается тоже при постановке. Стоимость в долларах известна только
 * после работы, а решение пускать или нет нужно принять до неё, — поэтому
 * считаем задачи, а деньги пишем следом как предохранитель.
 */

const today = () => new Date().toISOString().slice(0, 10);

/** Не истёк ли оплаченный период. Бесплатный не истекает никогда. */
function planActive(user) {
  if (!user.plan || user.plan === 'free') return true;
  if (!user.plan_until) return false;
  return new Date(user.plan_until) > new Date();
}

/**
 * Сводка по остатку — то, что показывается в приложении.
 * Счётчики за прошедшие сутки и за прошедший период здесь же обнуляются
 * на лету: хранить их сброшенными не нужно, важно только не показать
 * вчерашние цифры как сегодняшние.
 */
function summarize(user) {
  const expired = !planActive(user);
  const planId = expired ? 'free' : user.plan || 'free';
  const t = getTariff(planId);

  const sameDay = user.day_date && String(user.day_date).slice(0, 10) === today();
  const dayUsed = sameDay ? user.day_tasks : 0;

  // Период считается от даты покупки, а не от первого числа месяца:
  // человек платит 18-го и вправе ожидать месяц, а не двенадцать дней.
  const periodOver = expired || !user.period_start;
  const periodUsed = periodOver ? 0 : user.period_tasks;

  return {
    plan: planId,
    planName: t.name,
    expired,
    until: expired ? null : user.plan_until,
    day: { used: dayUsed, limit: t.perDay, left: Math.max(0, t.perDay - dayUsed) },
    period: { used: periodUsed, limit: t.perPeriod, left: Math.max(0, t.perPeriod - periodUsed) },
  };
}

/** Можно ли поставить ещё одну задачу. Возвращает причину отказа человеку. */
function check(user) {
  const s = summarize(user);
  if (s.period.left <= 0) {
    return {
      ok: false,
      reason: 'period',
      summary: s,
      error: 'Задачи в этом периоде закончились',
      detail: s.plan === 'free'
        ? 'Бесплатных задач было три — на них видно, как работает команда. Дальше нужен тариф.'
        : 'Квота обновится с началом нового периода. Можно перейти на старший тариф прямо сейчас.',
    };
  }
  if (s.day.left <= 0) {
    return {
      ok: false,
      reason: 'day',
      summary: s,
      error: 'Задачи на сегодня закончились',
      detail: `На вашем тарифе ${s.day.limit} в день. Следующая будет доступна завтра.`,
    };
  }
  return { ok: true, summary: s };
}

/**
 * Списать одну задачу. Одним запросом, чтобы два одновременных нажатия
 * не списали одну задачу дважды и не проскочили мимо лимита.
 */
async function spend(telegramId) {
  const { rows } = await pool.query(
    `UPDATE users
        SET day_date   = CURRENT_DATE,
            day_tasks  = CASE WHEN day_date = CURRENT_DATE THEN day_tasks + 1 ELSE 1 END,
            period_tasks = period_tasks + 1
      WHERE telegram_id = $1
      RETURNING plan, plan_until, period_start, period_tasks, period_cents, day_date, day_tasks`,
    [telegramId]
  );
  return rows[0] ? summarize(rows[0]) : null;
}

/** Вернуть списанную задачу, если поставить её так и не удалось. */
async function refund(telegramId) {
  await pool.query(
    `UPDATE users
        SET day_tasks    = GREATEST(0, day_tasks - 1),
            period_tasks = GREATEST(0, period_tasks - 1)
      WHERE telegram_id = $1`,
    [telegramId]
  );
}

/** Включить тариф после оплаты. Период считается от момента оплаты. */
async function activate(telegramId, tariff) {
  await pool.query(
    `UPDATE users
        SET plan         = $2,
            plan_until   = now() + ($3 || ' days')::interval,
            period_start = now(),
            period_tasks = 0,
            period_cents = 0,
            day_date     = NULL,
            day_tasks    = 0
      WHERE telegram_id = $1`,
    [telegramId, tariff.id, String(tariff.days)]
  );
}

module.exports = { summarize, check, spend, refund, activate, planActive };
