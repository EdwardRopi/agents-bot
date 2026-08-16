/**
 * Отдельный вход для локального раннера — твоего компьютера, который забирает
 * задачи из очереди, прогоняет их через агентов и возвращает результат.
 *
 * Это не пользователь Telegram, поэтому initData тут нет: только общий секрет
 * из переменной окружения RUNNER_TOKEN.
 */
function runnerAuth(req, res, next) {
  const token = req.headers['x-runner-token'];
  const expected = process.env.RUNNER_TOKEN;

  if (!expected) {
    return res.status(503).json({ error: 'RUNNER_TOKEN не задан на сервере' });
  }
  if (!token || token !== expected) {
    return res.status(401).json({ error: 'Неверный токен раннера' });
  }
  next();
}

module.exports = { runnerAuth };
