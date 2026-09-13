# FlareBlog

[English](README_EN.md) | [简体中文](README.md)

FlareBlog is an open-source, serverless blog foundation on Cloudflare, designed specifically for **AI Agent collaboration and minimal operations**: Astro Static Site Generation (SSG) + Cloudflare Worker API + a single Cloudflare D1 SQLite database. One of the "YiFang" products.

You can clone this repository directly, customize the design, modify features, or add new capabilities to suit your needs, and deploy it independently with your own Cloudflare account.

The site **intentionally does not include an administrative UI**. Day-to-day article authoring, publishing, editing, and deployment tasks are designed to be delegated directly to your **AI Coding Assistant (Agent)**.

## Features

- **Agent-Native Workflow**: Headless by design. Draft, publish, pin, and update articles via your AI Agent through clean APIs (see [AGENT_GUIDE.md](AGENT_GUIDE.md)).
- **Articles & Categories**: Markdown authoring, build-time HTML sanitization, pinned posts, pagination, and category breakdowns.
- **Search**: Pure client-side [Pagefind](https://pagefind.app/) indexing with zero backend runtime overhead.
- **Comments**: [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) CAPTCHA (optional) + IP rate limiting + global daily caps. Instant publishing with admin moderation controls.
- **View Counters**: Edge-based atomic counter with burst rate limiting.
- **Admin API**: Protected `/api/admin/*` endpoints with `x-admin-api-key` authentication for Agent automation.
- **Build Snapshot API**: `/api/build/*` with `x-build-token` for fast, unified SSG data fetching during build time.

## Architecture

```
┌────────────────────┐        ┌─────────────────────┐
│  Cloudflare Pages  │  fetch │   Cloudflare Worker │
│  Astro Static Site │ ─────► │   flareblog-api     │
│  (Repository root) │        │   (worker/)         │
└────────────────────┘        └──────────┬──────────┘
      │ Pull snapshot at build time       │
      ▼                                   ▼
┌──────────────────────────────────────────────┐
│          Cloudflare D1 (Single Database)     │
│        articles / comments / rate_limits     │
└──────────────────────────────────────────────┘
```

## Repository Structure

- `src/`：Astro pages, layout components, and browser-side client scripts
- `worker/`：Cloudflare Worker API (articles, comments, view counts, categories, admin, build snapshot)
- `shared/`：Shared TypeScript types between frontend and backend
- `tests/`：Vitest unit and security test suites
- `scripts/`：Local database initialization and flow validation scripts
- `AGENT_GUIDE.md`：Detailed API contracts, prompt templates, and operations guide for AI Agents

## Local Development

Prerequisites: Node.js `>=22.12.0`.

```bash
npm install
cp .env.example .env                       # Local default config (applies to both dev and build)
cp worker/.dev.vars.example worker/.dev.vars
npm run db:init                            # Initializes local D1 database with sample articles
npm run dev
```

- Astro frontend runs at `http://localhost:4321`, local Worker API runs at `http://127.0.0.1:8787`
- Default local environment variables point to the local Worker out of the box
- Local Turnstile uses Cloudflare's official testing keys (no real account needed locally)

## Common Commands

```bash
npm run check        # astro check + worker tsc type validation
npm test             # Vitest test suite (6 test suites, 27 tests)
npm run build        # Static site compilation + Pagefind indexing
npm run test:security
```

## Content Management & Media Assets

### 1. Agent Collaboration & Publishing
FlareBlog adopts a **Headless** architecture with no admin dashboard. All publishing and maintenance tasks are delegated to AI coding assistants (such as Antigravity, Claude Code, Cursor, Windsurf):
- **Full API Contracts & Instructions**: See **[AGENT_GUIDE.md](AGENT_GUIDE.md)**.
- **SSG Rebuild Mechanism**: Because the frontend is statically generated (SSG), updating articles in D1 requires a Cloudflare Pages rebuild to reflect changes. We strongly recommend configuring a **Deploy Hook (Webhook)** in Cloudflare Pages so your Agent can automatically trigger a rebuild via `curl` after publishing.

### 2. Images & Attachment Management
- **Lightweight Images**: Place images directly under the `public/images/` directory and reference them with relative paths in Markdown (e.g., `![Image Description](/images/photo.png)`).
- **High-Volume Images & Large Attachments (Recommended)**: For large media libraries, PDFs, archives, or audio/video files, use an object storage bucket. We recommend **[Cloudflare R2](https://developers.cloudflare.com/r2/)** (includes 10 GB/month free storage and **zero egress bandwidth fees**). Attach a custom domain to your R2 bucket and embed URLs directly in your Markdown.

### 3. Database Backup (D1 Export)
All blog posts and comments are stored in your Cloudflare D1 SQLite database. You can export a full SQL backup at any time:
```bash
# Export remote production database to a local SQL file
npx wrangler d1 export flareblog-db --remote --output=backup-$(date +%Y%m%d).sql
```
> See official documentation: [Cloudflare D1 Data Export](https://developers.cloudflare.com/d1/platform/export/).

## Deploying to Cloudflare

You can hand this section directly to your AI Agent to execute the deployment step by step:

### Step 1: Create and Initialize D1 Database (Choose Either)

FlareBlog uses a single Cloudflare D1 SQLite database for articles, comments, and metrics. You can choose either the **Cloudflare Web Dashboard (pure GUI, no CLI required)** or **Wrangler CLI (for developers / AI Agent automation)**:

#### Option A: Cloudflare Web Dashboard (GUI - No CLI Required)
1. **Create Database** (see [D1 Get Started](https://developers.cloudflare.com/d1/get-started/)):
   - Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/), navigate to **Storage & Databases** -> **D1 SQL Database**.
   - Click **Create database**, name it `flareblog-db`, and confirm.
2. **Initialize Schema**:
   - Open the created `flareblog-db` database and switch to the **Console** tab.
   - Open [`worker/schema.sql`](worker/schema.sql) in this repo, copy its entire contents, paste into the Console, and click **Execute**.
   - *(Optional)*: To seed sample articles, repeat the same with [`worker/mock_data.sql`](worker/mock_data.sql).
3. **Bind to Worker (After Deploying Worker in Step 3)**:
   - In Cloudflare Dashboard, open your deployed Worker (`flareblog-api`), go to **Settings** -> **Bindings**.
   - Click **Add** -> select **D1 database**:
     - **Variable name**: Enter `DB` (uppercase, accessed via `env.DB` in code).
     - **D1 database**: Select `flareblog-db` from the dropdown.
   - Click **Save and deploy**.

#### Option B: Wrangler CLI (Developer & Agent Friendly)
1. **Create Database via CLI**:
   ```bash
   npx wrangler d1 create flareblog-db
   ```
   Copy the returned unique `database_id` into `worker/wrangler.toml`.
2. **Execute Remote Migrations**:
   ```bash
   npx wrangler d1 execute flareblog-db --remote --file=worker/schema.sql
   # Optional: Import sample articles
   npx wrangler d1 execute flareblog-db --remote --file=worker/mock_data.sql
   ```
   (Wrangler CLI will automatically bind the database upon deployment based on `wrangler.toml`).

---

### Step 2: Configure Worker Secrets
See [Wrangler Secrets](https://developers.cloudflare.com/workers/configuration/secrets/), set secrets under `worker/`:
```bash
cd worker
npx wrangler secret put BUILD_API_TOKEN       # Generate a random token for build snapshots
npx wrangler secret put ADMIN_API_KEY         # Generate a random key for admin API
npx wrangler secret put TURNSTILE_SECRET_KEY  # Optional (leave empty to skip CAPTCHA)
```

### Step 3: Deploy Worker
See [Cloudflare Workers Guide](https://developers.cloudflare.com/workers/get-started/guide/):
```bash
cd worker && npx wrangler deploy
```
Note the deployed Worker URL (e.g., `https://flareblog-api.<subdomain>.workers.dev`).  
*Note: If you followed Option A, don't forget to bind `DB` to `flareblog-db` in the Cloudflare Dashboard under Worker Settings -> Bindings.*

### Step 4: Create Cloudflare Pages Project
See [Cloudflare Pages Guide](https://developers.cloudflare.com/pages/get-started/):
- Connect your Git repository. Set build command to `npm run build`, and output directory to `dist`.
- Set environment variables in Pages (**Settings -> Environment variables**):
  - `NODE_VERSION` = `22.12.0` (**Required** to ensure Node 22+ runtime)
  - `PUBLIC_API_BASE` = Your Worker URL from Step 3
  - `BUILD_API_TOKEN` = The same token configured in Step 2
  - `PUBLIC_TURNSTILE_SITEKEY` = Your Turnstile site key (optional)

### Step 5: Update Worker CORS Whitelist (⚠️ Critical Step)
- Once Pages is deployed, obtain your site URL (e.g., `https://my-blog.pages.dev` or your custom domain).
- Append your domain to `CORS_ORIGINS` in `worker/wrangler.toml`.
- Re-deploy the worker: `cd worker && npx wrangler deploy` so comment and view APIs allow cross-origin requests.

### Step 6: Configure Deploy Hook (Recommended)
See [Pages Deploy Hooks](https://developers.cloudflare.com/pages/configuration/build-hooks/):
- Go to Pages **Settings -> Builds & deployments -> Deploy hooks** and add a hook.
- Send an HTTP POST request to this URL to trigger automatic site rebuilds when new articles are published.

### Step 7: Customize Site Identity
- `astro.config.mjs`: `site` (your custom domain)
- `public/robots.txt`: Sitemap domain
- `public/_headers`: Replace `https://your-api.example` in CSP with your real Worker API URL
- `src/pages/about.astro`: Edit your About page bio

## Free Tier & Cost Breakdown

FlareBlog is engineered to run **100% within the Cloudflare Free Tier**, with zero monthly bills:

- **[Cloudflare Pages](https://developers.cloudflare.com/pages/platform/limits/)**: Unlimited static bandwidth, 500 builds/month;
- **[Cloudflare Workers](https://developers.cloudflare.com/workers/platform/pricing/)**: 100,000 requests/day included free;
- **[Cloudflare D1](https://developers.cloudflare.com/d1/platform/pricing/)**: 5,000,000 row reads/day, 100,000 row writes/day, 5 GB storage;
- **[Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/)**: Unlimited free CAPTCHA verifications;
- **[Cloudflare R2](https://developers.cloudflare.com/r2/pricing/)** (optional object storage): 10 GB/month free storage, **0 egress bandwidth costs**.

## Troubleshooting & FAQ

### 1. Why do comment submissions or view counts fail with CORS errors?
- **Cause**: The Worker has not whitelisted your frontend origin.
- **Solution**: Add your Pages domain (`https://xxx.pages.dev` or custom domain) to `CORS_ORIGINS` in `worker/wrangler.toml`, then run `cd worker && npx wrangler deploy`.

### 2. Why does Turnstile fail to load or show domain mismatch?
- **Cause**: Turnstile checks request origins.
- **Solution**: In Cloudflare Dashboard -> **Turnstile** -> Select your Widget -> **Settings**, ensure your blog domain is added to the **Allowed Domains** list.

### 3. Why doesn't a newly published article appear on the home page?
- **Cause**: The frontend is statically generated (SSG). Data is saved in D1, but static HTML must be rebuilt.
- **Solution**: Trigger a rebuild in Cloudflare Dashboard or call your configured Deploy Hook.

## Customizing UI Language

FlareBlog ships with clean Chinese UI labels by default. If you want a fully English blog interface, you only need to tweak a few component labels:
- **Navigation & Footer**: Edit `navItems` and footer text in [src/layouts/BaseLayout.astro](src/layouts/BaseLayout.astro).
- **Home & Categories**: Edit headings and defaults in [src/components/ArticleListLayout.astro](src/components/ArticleListLayout.astro).
- **Comments**: Edit form labels and button text in [src/components/CommentSection.astro](src/components/CommentSection.astro).
- **Search**: Edit placeholder and titles in [src/pages/search.astro](src/pages/search.astro).

## License

[MIT](LICENSE)
