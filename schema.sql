-- S3 存储连接信息表
CREATE TABLE IF NOT EXISTS storages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 's3',
    endpoint TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'us-east-1',
    access_key_id TEXT NOT NULL,
    secret_access_key TEXT NOT NULL,
    bucket TEXT NOT NULL,
    base_path TEXT DEFAULT '',
    is_public INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 会话表
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_type TEXT NOT NULL DEFAULT 'guest',
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_storages_is_public ON storages(is_public);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
