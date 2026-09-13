# FlareBlog

[简体中文](README.md) | [English](README_EN.md)

FlareBlog 是一方产品之一，专为 **Agent 协作与极简运维** 打造的 Cloudflare 开源博客基座：Astro 静态生成 + Cloudflare Worker API + 单个 D1 数据库。

你可以直接克隆本仓库，根据自己的要求自由修改、调整样式或新增能力，配上你自己的 Cloudflare 账号即可独立部署。

站点**不设后台管理 UI**，日常的文章撰写、发布、内容修改以及部署运维，均推荐直接托管给你的 **AI 编程助手（Agent）**。让 Agent 协助你管理一个完全属于自己的现代化独立博客。

## 功能

- **Agent 原生协作**：无需管理后台，文章撰写、发布、置顶与修改全交由 AI Agent 通过接口操作（参见 [AGENT_GUIDE.md](AGENT_GUIDE.md)）
- **文章与分类**：Markdown 写作、构建期 HTML 清洗、置顶、分页、分类统计
- **搜索**：Pagefind 纯前端索引，零后端开销
- **评论**：[Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) 人机验证（可选）+ IP 限流 + 全站每日上限，评论直接发布，管理接口可人工调整
- **浏览量**：边缘计数，burst 限流
- **管理 API**：`/api/admin/*` 用 `x-admin-api-key` 头管理文章与评论（供 Agent 或脚本调用）
- **构建 API**：`/api/build/*` 用 `x-build-token` 头在 SSG 构建时拉取全站数据快照

## 架构

```
┌────────────────────┐        ┌─────────────────────┐
│  Cloudflare Pages  │  fetch │   Cloudflare Worker │
│  Astro 静态站点     │ ─────► │   flareblog-api     │
│  (本仓库根目录)     │        │   (worker/)         │
└────────────────────┘        └──────────┬──────────┘
      │ 构建时 x-build-token 拉数据        │
      ▼                                   ▼
┌──────────────────────────────────────────────┐
│              Cloudflare D1 (单个库)           │
│        articles / comments / rate_limits     │
└──────────────────────────────────────────────┘
```

## 目录

- `src/`：Astro 页面、组件和浏览器端逻辑
- `worker/`：Cloudflare Worker API（文章、评论、浏览量、分类、管理、构建）
- `shared/`：前后端共享类型
- `tests/`：Vitest 单元与安全测试
- `scripts/`：本地数据库初始化与流程验证脚本
- `AGENT_GUIDE.md`：面向 AI Agent 的文章管理契约、自然语言 Prompt 与部署指南

## 本地开发

环境要求：Node.js `>=22.12.0`。

```bash
npm install
cp .env.example .env                       # 本地默认配置，dev 与 build 均自动生效
cp worker/.dev.vars.example worker/.dev.vars
npm run db:init                            # 初始化本地 D1 并灌入示例文章
npm run dev
```

- Astro 运行在 `http://localhost:4321`，本地 Worker 运行在 `http://127.0.0.1:8787`
- 本地默认配置已指向本地 Worker，无需修改即可直接预览
- 本地 Turnstile 使用 Cloudflare 官方测试密钥，无需真实账号

## 常用命令

```bash
npm run check        # astro check + worker tsc 类型检查
npm test             # Vitest 测试（6 个测试套件）
npm run build        # 构建静态产物 + Pagefind 索引
npm run test:security
```

## 文章管理与媒体资源

### 1. Agent 协作与发布
FlareBlog 采用 **无后台 UI（Headless）** 架构。所有日常文章的写作、更新、打标签与归档，均推荐交由你日常使用的 AI 编程助手（如 Antigravity、Claude Code、Cursor、Windsurf 等）处理：
- **详细指令与 API 契约**：请参阅 **[AGENT_GUIDE.md](AGENT_GUIDE.md)**。
- **页面刷新机制（SSG）**：因为前台页面是 Astro 纯静态生成（SSG），通过 API 更新文章后，**需重新构建 Pages 才会更新前台页面**。强烈建议在 Cloudflare Pages 设置中创建 **Deploy Hook (Webhook)**，让 Agent 在发布文章后自动通过 `curl` 触发重新生成。

### 2. 图片与附件资源管理
- **轻量图片**：直接放入仓库的 `public/images/` 目录下，在 Markdown 中引用相对路径即可（如 `![示例图片](/images/my-photo.png)`），随静态站点一同打包分发。
- **大图与多媒体附件（强烈推荐存储桶）**：如果文章包含大量高分辨率图片，或者需要分发 PDF、压缩包、音频/视频等附件，建议使用对象存储桶。首选推荐 **[Cloudflare R2](https://developers.cloudflare.com/r2/)**（免费计划提供每月 10 GB 存储空间，且**免收任何外网出口流量费用**）。为 R2 存储桶绑定自定义域名后，在 Markdown 中直接引用公开链接即可。

### 3. 数据安全与备份 (D1 Backup)
因为博客内容直接保存在云端 D1 SQLite 数据库中，你可以随时通过 Wrangler 一键导出完整的本地 SQL 备份：
```bash
# 一键导出云端 D1 数据库到本地 SQL 文件
npx wrangler d1 export flareblog-db --remote --output=backup-$(date +%Y%m%d).sql
```
> 参考官方文档：[Cloudflare D1 数据导出指南](https://developers.cloudflare.com/d1/platform/export/)。

## 部署到 Cloudflare

你可以将本章节直接提供给你的 AI Agent，让 Agent 协助你按顺序完成部署：

### 第一步：创建并初始化 D1 数据库（二选一）

FlareBlog 使用单个 Cloudflare D1 SQLite 数据库存储文章、评论与统计数据。你可以自由选择**网页控制台（适合纯浏览器操作）**或 **Wrangler 命令行（适合开发者 / Agent 自动化）**：

#### 途径 A：Cloudflare 网页控制台（GUI 推荐，零命令行门槛）
1. **创建数据库**（参考 [D1 快速入门](https://developers.cloudflare.com/d1/get-started/)）：
   - 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，在左侧进入 **存储和数据库 (Storage & Databases)** -> **D1 SQL 数据库**。
   - 点击 **创建数据库 (Create database)**，名称填入 `flareblog-db` 并确认。
2. **初始化表结构**：
   - 点击进入刚创建的 `flareblog-db`，切换到 **控制台 (Console)** 标签页。
   - 打开本仓库中的 [`worker/schema.sql`](worker/schema.sql)，**复制全部 SQL 内容**粘贴至控制台，点击 **执行 (Execute)**。
   - *（可选）*：如需预置通用示例文章，同样复制 [`worker/mock_data.sql`](worker/mock_data.sql) 并执行一次。
3. **绑定到 Worker（在下方第三步部署 Worker 后操作）**：
   - 在部署 Worker 后，进入该 Worker 的 **设置 (Settings)** -> **变量与机密 / 绑定 (Bindings)**。
   - 点击 **添加 (Add)** -> 选择 **D1 数据库**：
     - **变量名称（Variable name）**：填 `DB`（必须大写，代码中通过 `env.DB` 访问）。
     - **D1 数据库（D1 database）**：下拉菜单中选择 `flareblog-db`。
   - 点击 **保存并部署 (Save and deploy)** 即可。

#### 途径 B：Wrangler 命令行（CLI 推荐，适合终端或 AI Agent）
1. **命令行创建**：
   ```bash
   npx wrangler d1 create flareblog-db
   ```
   终端会输出数据库信息与一串唯一的 `database_id`。将其填入 `worker/wrangler.toml` 中的 `database_id`。
2. **一键执行数据库迁移**：
   ```bash
   npx wrangler d1 execute flareblog-db --remote --file=worker/schema.sql
   # 可选：导入通用示例文章
   npx wrangler d1 execute flareblog-db --remote --file=worker/mock_data.sql
   ```
   （通过 CLI 部署 Worker 时，Wrangler 会自动根据 `wrangler.toml` 建立绑定，无需再在网页后台手动添加）。

---

### 第二步：配置 Worker 密钥
参考 [Wrangler 密钥管理](https://developers.cloudflare.com/workers/configuration/secrets/)，在 `worker/` 目录下设置关键机密：
```bash
cd worker
npx wrangler secret put BUILD_API_TOKEN       # 自选随机长令牌（构建拉取快照用）
npx wrangler secret put ADMIN_API_KEY         # 自选随机长密钥（管理接口用）
npx wrangler secret put TURNSTILE_SECRET_KEY  # 可选（留空则评论跳过人机验证）
```

### 第三步：部署 Worker
参考 [Cloudflare Workers 部署](https://developers.cloudflare.com/workers/get-started/guide/)：
```bash
cd worker && npx wrangler deploy
```
记下 Worker 部署地址（形如 `https://flareblog-api.<你的子域>.workers.dev`）。  
*注：若使用途径 A，部署后别忘了前往控制台为 Worker 添加变量名为 `DB` 的 D1 绑定。*

### 第四步：创建 Cloudflare Pages 前端项目
参考 [Cloudflare Pages 部署](https://developers.cloudflare.com/pages/get-started/)：
- 连接你的 Git 仓库，构建命令填 `npm run build`，输出目录填 `dist`。
- 在 Pages 项目设置中配置环境变量（**Settings -> Environment variables**）：
  - `NODE_VERSION` = `22.12.0`（**必填**，保证 Pages 使用 Node 22+ 构建环境）
  - `PUBLIC_API_BASE` = 第三步部署的 Worker URL
  - `BUILD_API_TOKEN` = 第二步设置的构建令牌
  - `PUBLIC_TURNSTILE_SITEKEY` = 你的 Turnstile 站点公开密钥（可选）

### 第五步：回填 Worker CORS 跨域白名单（⚠️ 核心步骤）
- Pages 部署成功后，获得站点域名（如 `https://xxx.pages.dev` 或自定义域名）。
- 将你的站点域名追加填入 `worker/wrangler.toml` 的 `CORS_ORIGINS` 配置项中。
- 再次执行 `cd worker && npx wrangler deploy`，确保评论与浏览量接口跨域畅通。

### 第六步：配置 Deploy Hook（可选但强烈推荐）
参考 [Pages Deploy Hooks](https://developers.cloudflare.com/pages/configuration/build-hooks/)：
- 在 Pages 的 **Settings -> Builds & deployments -> Deploy hooks** 中添加一个 Hook。
- 后续 Agent 发布文章后，向该 Hook URL 发送 POST 请求即可自动重新生成博客。

### 第七步：修改站点个性化配置
- `astro.config.mjs` 中的 `site`（你的博客域名）
- `public/robots.txt` 中的 Sitemap 域名
- `public/_headers` 中 CSP 的 `https://your-api.example`（替换为真实 Worker URL）
- `src/pages/about.astro` 中的关于页面介绍文案

## 免费配额与成本说明

FlareBlog 技术栈设计为完全运行在 Cloudflare 免费计划（Free Tier）内，零账单开销：

- **[Cloudflare Pages](https://developers.cloudflare.com/pages/platform/limits/)**：无限静态流量带宽，每月 500 次构建；
- **[Cloudflare Workers](https://developers.cloudflare.com/workers/platform/pricing/)**：免费版提供每日 100,000 次请求，轻量个人博客绰绰有余；
- **[Cloudflare D1](https://developers.cloudflare.com/d1/platform/pricing/)**：免费版提供每日 500 万行读取、10 万行写入及 5 GB 存储空间；
- **[Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/)**：全功能免费，无调用上限；
- **[Cloudflare R2](https://developers.cloudflare.com/r2/pricing/)**（可选对象存储）：免费提供 10 GB 存储空间，且**无任何外网出口流量费**。

## 环境变量速查

| 变量 | 位置 | 必需 | 说明 |
|---|---|---|---|
| `NODE_VERSION` | Pages 构建环境变量 | **是** | 设为 `22.12.0`，保证构建环境兼容 |
| `PUBLIC_API_BASE` | 前端 `.env` / Pages 变量 | **是** | Worker API 地址 |
| `BUILD_API_TOKEN` | 前端构建 + Worker Secret | **是** | 构建期拉取全站数据的安全令牌 |
| `ADMIN_API_KEY` | Worker Secret | **是** | `/api/admin/*` 管理端密钥 |
| `PUBLIC_TURNSTILE_SITEKEY` | 前端 `.env` / Pages 变量 | 否 | Turnstile 公开密钥；留空不显示人机验证 |
| `TURNSTILE_SECRET_KEY` | Worker Secret | 否 | Turnstile 私钥；留空时评论跳过验证 |

## 常见问题排查 (FAQ)

### 1. 为什么前台提交评论或统计阅读量报 CORS 跨域错误？
- **原因**：Worker 没有将你的 Pages 前台域名纳入跨域白名单。
- **解决办法**：请将 Pages 部署后的域名（例如 `https://my-blog.pages.dev`）或者自定义域名写入 `worker/wrangler.toml` 中的 `CORS_ORIGINS`，然后执行 `cd worker && npx wrangler deploy`。

### 2. 为什么 Turnstile 人机验证组件加载失败或提示域名不匹配？
- **原因**：Cloudflare Turnstile 会校验调用方的域名来源。
- **解决办法**：进入 Cloudflare Dashboard -> **Turnstile** -> 找到你的站点小部件 -> 点击 **Settings**，确保将你的博客域名（如 `my-blog.pages.dev` 或自定义域名）添加到了 **Allowed Domains** 列表中。

### 3. 发布新文章后，为什么博客首页没有立刻出现？
- **原因**：前台基于 Astro 静态预渲染（SSG），文章已成功写入 D1 数据库，但前台静态 HTML 尚未重新生成。
- **解决办法**：在 Cloudflare Dashboard 点击重新部署，或调用配置好的 Deploy Hook 触发自动重新生成。

## 扩展指南

- **加页面**：在 `src/pages/` 下新增 `.astro`，套用 `BaseLayout` 即可获得主题、导航与视图过渡
- **加 API**：在 `worker/src/routes/` 参照 `views.ts` 写路由，并在 `index.ts` 注册；敏感操作在 `src/config/rateLimits.ts` 加限流规则
- **改样式**：全局设计 token 在 `src/styles/global.css` 顶部 CSS 变量区
- **数据模型**：改 `worker/schema.sql` 与 `worker/src/types.ts`、`shared/types.ts`，保持三处一致

## License

[MIT](LICENSE)
