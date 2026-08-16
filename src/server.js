require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const { authMiddleware } = require('./middleware/auth');
const { runnerAuth } = require('./middleware/runnerAuth');
const meRoutes = require('./routes/me');
const briefRoutes = require('./routes/brief');
const tasksRoutes = require('./routes/tasks');
const runnerRoutes = require('./routes/runner');
require('./bot/bot');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Всё под /api — только реальные пользователи мини-аппа
app.use('/api', authMiddleware);
app.use('/api/me', meRoutes);
app.use('/api/brief', briefRoutes);
app.use('/api/tasks', tasksRoutes);

// Отдельный вход для локального раннера — по общему секрету, без Telegram
app.use('/runner', runnerAuth, runnerRoutes);

// Собранный мини-апп отдаём тем же сервисом: один хост, никаких CORS в бою
const webDist = path.join(__dirname, '..', 'web', 'dist');
app.use(express.static(webDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/runner')) return next();
  res.sendFile(path.join(webDist, 'index.html'), (err) => {
    if (err) res.status(404).send('Мини-апп ещё не собран: npm run build в папке web');
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
