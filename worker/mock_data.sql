-- 插入测试文章
INSERT INTO articles (title, content, summary, category, status, is_pinned, created_at) VALUES 
('欢迎来到新版博客', '这是第一篇测试文章的正文。\n\n## 新特性\n- Astro 静态生成\n- Cloudflare Workers API\n- 纯前端 Pagefind 搜索', '这是第一篇测试文章的摘要，介绍了新版博客的技术栈。', '随笔,Astro', 1, 1, strftime('%s','now') - 86400),
('如何在 Windows 上配置本地开发环境', '本文介绍如何配置 Windows 上的开发环境...\n\n```bash\n# 安装 nvm-windows\nwinget install coreybutler.nvm-windows\n```', '详细教程：在 Windows 上配置现代化的前端开发环境。', '技术教程,Windows', 1, 0, strftime('%s','now') - 43200),
('Cloudflare D1 数据库初体验', 'D1 是 Cloudflare 推出的基于 SQLite 的边缘数据库。使用体验非常丝滑。', '记录一下使用 Cloudflare D1 构建 serverless 应用的感受。', '随笔,数据库', 1, 0, strftime('%s','now'));

-- 插入测试评论
INSERT INTO comments (article_id, username, email, content, status, created_at) VALUES 
(1, '读者A', 'readerA@example.com', '哇，新版博客真好看！速度也很快。', 1, strftime('%s','now') - 3600),
(1, '测试用户', null, '占个沙发，期待后续内容。', 1, strftime('%s','now') - 1800),
(2, '小白', null, '按照教程配置成功了，感谢分享！', 1, strftime('%s','now') - 600);
