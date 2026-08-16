require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Схема применена');
  await pool.end();
})().catch((err) => {
  console.error('Миграция не прошла:', err.message);
  process.exit(1);
});
