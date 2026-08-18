-- Схема ставится повторным запуском без вреда: всё через IF NOT EXISTS.
--
-- База отдельная, своя, поэтому таблицы живут в public: разводить их по
-- собственной схеме нужно было, только пока инстанс делился с трекером
-- трезвости, где своя таблица users.

CREATE TABLE IF NOT EXISTS users (
    id           SERIAL PRIMARY KEY,
    telegram_id  BIGINT UNIQUE NOT NULL,
    username     TEXT,
    first_name   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Доступ только по приглашению. Без этого любой, кто найдёт бота, заведёт себе
-- пространство и начнёт ставить задачи, которые кто-то должен выполнять.
ALTER TABLE users ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by TEXT;

CREATE TABLE IF NOT EXISTS invites (
    code        TEXT PRIMARY KEY,
    label       TEXT NOT NULL,          -- станет названием рабочего пространства
    max_uses    INTEGER NOT NULL DEFAULT 1,
    uses        INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Рабочее пространство = один бизнес клиента.
-- В первой версии у пользователя оно одно, но таблица сразу рассчитана
-- на несколько: агентство ведёт нескольких клиентов из одного аккаунта.
CREATE TABLE IF NOT EXISTS workspaces (
    id           SERIAL PRIMARY KEY,
    owner_id     BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_id);

-- Бриф. Это те самые 11 разделов шаблона: каждый раздел — ключ в JSON.
-- Хранится целиком одним объектом, потому что структура ещё будет меняться,
-- а разносить её по колонкам на этом этапе — значит переписывать миграции
-- на каждый новый вопрос анкеты.
CREATE TABLE IF NOT EXISTS briefs (
    workspace_id INTEGER PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    sections     JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Задача агенту. Она же сообщение в переписке с ним:
-- prompt — что попросил человек, result_md — что ответил агент.
CREATE TABLE IF NOT EXISTS tasks (
    id            SERIAL PRIMARY KEY,
    workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    agent         TEXT NOT NULL,                  -- smm | editor | leads
    prompt        TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'new',    -- new | running | done | failed
    result_md     TEXT,
    error         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    taken_at      TIMESTAMPTZ,
    done_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_ws_agent ON tasks(workspace_id, agent, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status, created_at);

-- ---------------------------------------------------------------------------
-- Подписка и расход
-- ---------------------------------------------------------------------------

-- Тариф живёт на владельце, а не на пространстве: агентский тариф ведёт
-- несколько бизнесов, и три задачи в день у него общие на всех.
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan           TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_until     TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS period_start   TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS period_tasks   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS period_cents   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS day_date       DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS day_tasks      INTEGER NOT NULL DEFAULT 0;

-- Платежи. charge_id уникален намеренно: Telegram может прислать одно и то же
-- событие дважды, и без этого ограничения клиент получил бы два периода
-- за одну оплату.
CREATE TABLE IF NOT EXISTS payments (
    id           SERIAL PRIMARY KEY,
    telegram_id  BIGINT NOT NULL,
    charge_id    TEXT UNIQUE NOT NULL,
    plan         TEXT NOT NULL,
    stars        INTEGER NOT NULL,
    is_recurring BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(telegram_id, created_at);

-- Расход по каждому обращению к модели. Без этой таблицы невозможно узнать,
-- какой клиент разоряет, пока не придёт счёт от Anthropic.
CREATE TABLE IF NOT EXISTS usage (
    id           SERIAL PRIMARY KEY,
    task_id      INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
    telegram_id  BIGINT,
    agent        TEXT NOT NULL,
    model        TEXT NOT NULL,
    in_tokens    INTEGER NOT NULL DEFAULT 0,
    out_tokens   INTEGER NOT NULL DEFAULT 0,
    cached_in    INTEGER NOT NULL DEFAULT 0,
    cents        NUMERIC(10, 4) NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_user ON usage(telegram_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_task ON usage(task_id);
