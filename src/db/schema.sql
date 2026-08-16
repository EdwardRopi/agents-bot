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
