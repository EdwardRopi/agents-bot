const { Pool } = require('pg');

// Render и большинство облачных Postgres требуют SSL для внешних подключений,
// локальный на localhost — обычно нет.
const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

module.exports = pool;
