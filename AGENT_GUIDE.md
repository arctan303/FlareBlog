# FlareBlog AI Agent 指南 (AGENT_GUIDE)

> **致 AI 助手（Agent）**：当你被唤起在当前仓库执行任务时，请仔细阅读本指南。FlareBlog 是一个专为 **Agent-Native** 设计的开源博客基座。

---

## 1. 核心理念与架构

FlareBlog 的核心设计哲学是**“无管理后台，文章与运维全交由 Agent”**：
- **人类视角**：人类站长不需要登录复杂的管理后台，只需向你（AI Agent）提出想法（例如：“帮我写一篇关于 Cloudflare D1 的总结并发布” 或 “把第 1 篇文章置顶”）。
- **Agent 视角**：你即为该博客的“系统管理员与内容管家”。你通过 Worker 提供的管理 API（携带 `x-admin-api-key`）或者直接通过 Wrangler CLI 操作 D1 数据库来管理文章与评论。
- **页面展现（SSG 机制）**：博客前台是由 Astro 静态生成的（SSG）。当你在数据库中新增或修改了文章后，**需要触发 Cloudflare Pages 重新构建**，新内容才会生成静态 HTML 并展示给读者。

```
人类站长 ──自然语言指令──► AI Agent (你)
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
    1. 管理 API (写入 D1)        2. 触发 Pages 重建
   POST /api/admin/articles      POST <DEPLOY_HOOK_URL>
             │                           │
             ▼                           ▼
    Cloudflare D1 存储            Cloudflare Pages 静态渲染
```

---

## 2. 人类常用指令（Prompt 模板）

人类站长通常会向你发出类似以下的自然语言指令，请识别意图并执行底层操作：

| 站长自然语言意图 | Agent 执行动作 |
|---|---|
| *“帮我根据这篇草稿起草一篇博文，分类设为 [技术]，发布到博客”* | 格式化 Markdown，调用 `POST /api/admin/articles`，随后触发 Deploy Hook |
| *“把第 1 篇文章置顶，并更新一下摘要”* | 调用 `PATCH /api/admin/articles/1`，更新 `is_pinned: 1` 和 `summary` |
| *“帮我查一下最近的评论，把那条打广告的隐藏/删除掉”* | 调用 `GET /api/admin/comments` 检索，调用 `PATCH`（置 status=2）或 `DELETE` |
| *“文章发布完了，帮我刷新一下前台博客”* | 发送 `POST` 请求调用 Cloudflare Pages 的 Deploy Hook URL |
| *“帮我把生产 D1 数据库导出一份 SQL 备份到本地”* | 运行 `npx wrangler d1 export flareblog-db --remote --output=backup-YYYYMMDD.sql` |

---

## 3. 内容管理 API 契约

所有管理接口均需在 HTTP 请求头中携带管理密钥：
```http
x-admin-api-key: <ADMIN_API_KEY>
```
本地开发基础地址：`http://127.0.0.1:8787`
生产环境基础地址：`https://flareblog-api.<子域>.workers.dev`（或自建 API 域名）

### 3.1 数据模型（文章）

| 字段 | 类型 | 必需 | 说明 |
|---|---|---|---|
| `title` | string | 是 | 文章标题 |
| `content` | string | 是 | 正文 Markdown 内容 |
| `summary` | string | 否 | 摘要简述（若留空，列表页会提取正文开头） |
| `category` | string | 否 | 分类名称（支持多个，逗号分隔，例如 `'技术, 思考'`） |
| `author` | string | 否 | 作者署名，默认 `'FlareBlog'` |
| `last_editor` | string | 否 | 最后编辑者 |
| `status` | number | 否 | 状态：`1` = 已发布（默认），`0` = 草稿 |
| `is_pinned` | number | 否 | 置顶标记：`1` = 置顶，`0` = 正常（默认） |

### 3.2 核心操作 cURL 示例

#### ① 发布新文章
```bash
curl -X POST "http://127.0.0.1:8787/api/admin/articles" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: <ADMIN_API_KEY>" \
  -d '{
    "title": "我的第一篇 Agent 协作博客",
    "summary": "这是一篇由 AI Agent 自动发布的博文。",
    "category": "折腾",
    "status": 1,
    "is_pinned": 0,
    "content": "## 欢迎阅读\n\n这是通过管理 API 写入 Cloudflare D1 的正文内容。"
  }'
```
响应示例：`{ "data": { "id": 3, "message": "Article created successfully" } }`

#### ② 更新文章（修改标题、内容、置顶或状态）
```bash
curl -X PATCH "http://127.0.0.1:8787/api/admin/articles/3" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: <ADMIN_API_KEY>" \
  -d '{
    "is_pinned": 1,
    "summary": "更新后的摘要信息"
  }'
```

#### ③ 获取文章列表（含草稿）
```bash
curl -X GET "http://127.0.0.1:8787/api/admin/articles?page=1&limit=20" \
  -H "x-admin-api-key: <ADMIN_API_KEY>"
```

#### ④ 删除文章
```bash
curl -X DELETE "http://127.0.0.1:8787/api/admin/articles/3" \
  -H "x-admin-api-key: <ADMIN_API_KEY>"
```

---

## 4. 部署与静态重构工作流 (Deploy Hook)

### 4.1 为什么需要 Deploy Hook？
因为前台页面是 Astro 纯静态生成（SSG），更新 D1 数据库后，前台不会即时拉取。必须重新运行 `npm run build`。

### 4.2 自动化构建流程
1. **获取 Deploy Hook**（参考 [Pages Deploy Hooks 文档](https://developers.cloudflare.com/pages/configuration/build-hooks/)）：
   - 路径：Cloudflare Dashboard -> Workers & Pages -> 点击 Pages 项目 -> **Settings** -> **Builds & deployments** -> **Deploy hooks** -> **Add deploy hook**。
   - 获得 Hook URL，例如：`https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/xxxx-xxxx`。
2. **自动化触发**：
   - 当你（Agent）为站长新增或修改文章后，执行一条 HTTP POST 请求：
     ```bash
     curl -X POST "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/xxxx-xxxx"
     ```
   - Cloudflare Pages 会立即自动拉取最新 D1 数据生成静态页面。

---

## 5. 评论管理契约

评论在 FlareBlog 中默认直接入库发布（`status = 1`）。若有垃圾广告或违规评论，站长可指示你进行管理：

- **列出所有评论**：
  ```bash
  curl -X GET "http://127.0.0.1:8787/api/admin/comments?page=1&limit=50" \
    -H "x-admin-api-key: <ADMIN_API_KEY>"
  ```
- **审核/隐藏评论（修改状态）**：
  ```bash
  curl -X PATCH "http://127.0.0.1:8787/api/admin/comments/10" \
    -H "Content-Type: application/json" \
    -H "x-admin-api-key: <ADMIN_API_KEY>" \
    -d '{ "status": 2 }' # 0=待审, 1=通过, 2=拒绝/隐藏
  ```
- **彻底删除评论**：
  ```bash
  curl -X DELETE "http://127.0.0.1:8787/api/admin/comments/10" \
    -H "x-admin-api-key: <ADMIN_API_KEY>"
  ```

---

## 6. 图片与多媒体附件处理建议

当你为人类撰写或发布含有配图的文章时：
1. **少量轻量插图**：
   - 指导站长或直接将图片放入本地 `public/images/` 目录；
   - 在 Markdown 正文中引用相对路径：`![说明文字](/images/example.png)`。
2. **大量高清图片或大型附件（PDF/压缩包/音视频）**：
   - 引导站长开通并使用 **[Cloudflare R2](https://developers.cloudflare.com/r2/)** 对象存储（每月 10 GB 免费存储，0 出口流量费用）；
   - 在 Markdown 中直接引用 R2 绑定的公开自定义域名或公共存储桶链接（如 `https://media.example.com/attachments/file.zip`）。

---

## 7. 数据库安全与备份 (D1 Backup)

当站长需要你执行数据备份时，执行以下命令：
```bash
# 备份远程生产数据库
npx wrangler d1 export flareblog-db --remote --output=backup-$(date +%Y%m%d).sql
```
> 参考文档：[Cloudflare D1 数据导出](https://developers.cloudflare.com/d1/platform/export/)。

---

## 8. Agent 安装与初始化运维清单

当站长需要你协助部署到其 Cloudflare 账号时，请按如下标准步骤执行：

1. **准备本地环境**：
   - 确保 `node >= 22.12.0`。
   - 运行 `npm install`。
   - 复制配置：`cp .env.example .env` 与 `cp worker/.dev.vars.example worker/.dev.vars`。
   - 运行 `npm run db:init` 初始化本地 D1 数据库并填充示例数据。
2. **远程 D1 数据库开辟与绑定**（参考 [D1 快速入门](https://developers.cloudflare.com/d1/get-started/)）：
   - **途径 A（Agent CLI 自动化）**：
     - 执行 `npx wrangler d1 create flareblog-db`。
     - 将输出的 `database_id` 回填至 `worker/wrangler.toml` 中的 `database_id`。
     - 刷入表结构：
       ```bash
       npx wrangler d1 execute flareblog-db --remote --file=worker/schema.sql
       # 可选：灌入示例文章
       npx wrangler d1 execute flareblog-db --remote --file=worker/mock_data.sql
       ```
   - **途径 B（指引人类在 Cloudflare 控制台操作）**：
     - 指引站长在 Cloudflare 仪表盘 `Storage & Databases -> D1 SQL Database` 创建名为 `flareblog-db` 的数据库。
     - 进入 `flareblog-db` 的 `Console` 标签页，粘贴并执行 `worker/schema.sql`（以及可选的 `mock_data.sql`）。
     - 在第 3 步部署 Worker 后，指引站长在 Worker 的 `Settings -> Bindings` 中添加 D1 绑定：变量名称填 `DB`，选中 `flareblog-db`。
3. **配置 Worker 密钥并部署**（参考 [Wrangler 密钥 Secrets 管理](https://developers.cloudflare.com/workers/configuration/secrets/)）：
   - 进入 `worker/` 目录：
     ```bash
     cd worker
     npx wrangler secret put BUILD_API_TOKEN     # 设置随机长令牌
     npx wrangler secret put ADMIN_API_KEY       # 设置管理密钥
     npx wrangler secret put TURNSTILE_SECRET_KEY # 可选（未配置则跳过人机验证）
     npx wrangler deploy
     ```
   - 记录下部署成功后的 Worker 地址（例如 `https://flareblog-api.<subdomain>.workers.dev`）。
4. **Cloudflare Pages 前端配置**（参考 [Pages 部署](https://developers.cloudflare.com/pages/get-started/)）：
   - 构建命令：`npm run build`
   - 输出目录：`dist`
   - 环境变量（Settings -> Environment variables）：
     - `NODE_VERSION`: `22.12.0`（**必配**，防止 Pages 构建环境 Node 过低）
     - `PUBLIC_API_BASE`: Worker 的真实地址
     - `BUILD_API_TOKEN`: 与 Worker secret 相同的令牌
     - `PUBLIC_TURNSTILE_SITEKEY`: （可选，Turnstile 公开键）
5. **回填 Worker CORS 域名**：
   - 获取 Pages 部署后的域名（例如 `https://xxx.pages.dev` 或自定义域名）。
   - 将该域名追加填入 `worker/wrangler.toml` 中的 `CORS_ORIGINS` 配置项。
   - 再次执行 `cd worker && npx wrangler deploy` 使跨域白名单生效。

---

## 9. 官方参考文档链接

- [Cloudflare D1 文档](https://developers.cloudflare.com/d1/)
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Cloudflare Turnstile 文档](https://developers.cloudflare.com/turnstile/)
- [Cloudflare R2 对象存储文档](https://developers.cloudflare.com/r2/)
- [Cloudflare Pages Deploy Hooks 文档](https://developers.cloudflare.com/pages/configuration/build-hooks/)
