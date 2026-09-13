-- FlareBlog D1 Schema
-- 文章表
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    html_cache TEXT,
    summary TEXT,
    category TEXT,
    author TEXT DEFAULT 'FlareBlog',
    last_editor TEXT,
    status INTEGER DEFAULT 1,       -- 0=草稿 1=已发布
    is_pinned INTEGER DEFAULT 0,    -- 1=置顶
    views INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER
);

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    email TEXT,
    content TEXT NOT NULL,
    status INTEGER DEFAULT 1,       -- 默认直接发布；0=待审 2=拒绝（管理接口可人工调整）
    created_at INTEGER NOT NULL,
    ip TEXT,
    user_agent TEXT,
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at);
CREATE INDEX IF NOT EXISTS idx_articles_is_pinned ON articles(is_pinned);
CREATE INDEX IF NOT EXISTS idx_articles_status_pinned_created ON articles(status, is_pinned, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_article_id ON comments(article_id);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_article_status_created ON comments(article_id, status, created_at);

-- 系统设置表
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 访问频率限制表
CREATE TABLE IF NOT EXISTS rate_limits (
    ip TEXT NOT NULL,
    action TEXT NOT NULL,
    minute_count INTEGER DEFAULT 0,
    minute_reset_at INTEGER,
    daily_count INTEGER DEFAULT 0,
    daily_reset_at INTEGER,
    PRIMARY KEY (ip, action)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_daily_reset ON rate_limits(daily_reset_at);
