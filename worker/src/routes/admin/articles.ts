/**
 * Admin Article endpoints.
 */
import type {
  AdminArticleListItem,
  ArticleRow,
  CreateArticleBody,
  PaginatedResponse,
  RouteContext,
  UpdateArticleBody,
} from '../../types';
import { jsonOk, jsonError, notFound } from '../../utils/response';
import { Router } from '../../router';
import { parsePositiveInt } from '../../utils/params';

/** Register admin article routes on the given router. */
export function registerAdminArticleRoutes(router: Router): void {
  router.get('/api/admin/articles', listArticlesAdmin);
  router.get('/api/admin/articles/:id', getArticleAdmin);
  router.post('/api/admin/articles', createArticle);
  router.put('/api/admin/articles/:id', updateArticle);
  router.patch('/api/admin/articles/:id', updateArticle);
  router.delete('/api/admin/articles/:id', deleteArticle);
}

/**
 * GET /api/admin/articles
 * List all articles (including drafts).
 */
async function listArticlesAdmin(ctx: RouteContext): Promise<Response> {
  const url = new URL(ctx.request.url);
  const page = parsePositiveInt(url.searchParams.get('page'));
  const limit = parsePositiveInt(url.searchParams.get('limit'), 10, 100);
  const offset = (page - 1) * limit;

  const db = ctx.env.DB;

  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM articles`)
    .first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const rows = await db
    .prepare(
      `SELECT id, title, summary, category, author, last_editor, status, is_pinned, views, created_at, updated_at
       FROM articles
       ORDER BY id DESC
       LIMIT ? OFFSET ?`
    )
    .bind(limit, offset)
    .all<AdminArticleListItem>();

  const response: PaginatedResponse<AdminArticleListItem> = {
    data: rows.results,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };

  return jsonOk(response);
}

/**
 * GET /api/admin/articles/:id
 * Get a single article by ID (includes full content, even for drafts).
 */
async function getArticleAdmin(ctx: RouteContext): Promise<Response> {
  const id = parseInt(ctx.params.id, 10);
  if (isNaN(id)) return jsonError('Invalid article ID', 400);

  const article = await ctx.env.DB
    .prepare('SELECT * FROM articles WHERE id = ?')
    .bind(id)
    .first<ArticleRow>();

  if (!article) return notFound('Article not found');
  return jsonOk(article);
}

/**
 * POST /api/admin/articles
 * Create a new article.
 */
async function createArticle(ctx: RouteContext): Promise<Response> {
  let body: CreateArticleBody;
  try {
    body = await ctx.request.json<CreateArticleBody>();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  if (!body.title || !body.content) {
    return jsonError('Title and content are required', 400);
  }
  if (body.last_editor !== undefined && body.last_editor !== null && typeof body.last_editor !== 'string') {
    return jsonError('Last editor must be a string or null', 400);
  }
  if (body.status !== undefined && (typeof body.status !== 'number' || (body.status !== 0 && body.status !== 1))) {
    return jsonError('status must be 0 (draft) or 1 (published)', 400);
  }
  if (body.is_pinned !== undefined && (typeof body.is_pinned !== 'number' || (body.is_pinned !== 0 && body.is_pinned !== 1))) {
    return jsonError('is_pinned must be 0 or 1', 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const createdAt = body.created_at || now;

  const result = await ctx.env.DB
    .prepare(
      `INSERT INTO articles (
        title, content, html_cache, summary, category, author, last_editor, status, is_pinned, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      body.title,
      body.content,
      body.html_cache || null,
      body.summary || null,
      body.category || null,
      body.author || 'FlareBlog',
      body.last_editor?.trim() || null,
      body.status ?? 1,
      body.is_pinned ?? 0,
      createdAt
    )
    .run();

  if (result.success) {
    return jsonOk({ id: result.meta.last_row_id, message: 'Article created successfully' });
  }
  return jsonError('Failed to create article', 500);
}

/**
 * PATCH or PUT /api/admin/articles/:id
 * Partially update an existing article. PUT remains for backward compatibility.
 */
async function updateArticle(ctx: RouteContext): Promise<Response> {
  const id = parseInt(ctx.params.id, 10);
  if (isNaN(id)) return jsonError('Invalid article ID', 400);

  let body: UpdateArticleBody;
  try {
    body = await ctx.request.json<UpdateArticleBody>();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const updates: string[] = [];
  const values: any[] = [];

  const fields = [
    'title', 'content', 'summary', 'category',
    'author', 'last_editor', 'status', 'is_pinned', 'html_cache'
  ];

  // 兼容前端可能传 camelCase 的情况
  const b = body as any;
  if (b.last_editor !== undefined && b.last_editor !== null && typeof b.last_editor !== 'string') {
    return jsonError('Last editor must be a string or null', 400);
  }
  if (b.isPinned !== undefined) b.is_pinned = b.isPinned;
  if (b.htmlCache !== undefined) b.html_cache = b.htmlCache;

  // status / is_pinned 只能取 0/1，非法值会导致文章“合法写入但永久不可见”。
  // 与 createArticle 保持严格一致的契约：仅接受 number 类型且取值 0/1。
  if (b.status !== undefined && (typeof b.status !== 'number' || (b.status !== 0 && b.status !== 1))) {
    return jsonError('status must be 0 (draft) or 1 (published)', 400);
  }
  if (b.is_pinned !== undefined && (typeof b.is_pinned !== 'number' || (b.is_pinned !== 0 && b.is_pinned !== 1))) {
    return jsonError('is_pinned must be 0 or 1', 400);
  }

  for (const field of fields) {
    if (b[field] !== undefined) {
      updates.push(`${field} = ?`);
      // 如果传来的是空字符串，转换为 null，保持和 createArticle 行为一致
      let val = b[field];
      if (field === 'last_editor' && typeof val === 'string') {
        val = val.trim() || null;
      } else if (val === '' && ['html_cache', 'summary', 'category'].includes(field)) {
        val = null;
      }
      values.push(val);
    }
  }

  if (updates.length === 0) {
    return jsonError('No fields to update', 400);
  }

  // Always update updated_at
  updates.push('updated_at = ?');
  values.push(Math.floor(Date.now() / 1000));

  values.push(id); // For WHERE id = ?

  const query = `UPDATE articles SET ${updates.join(', ')} WHERE id = ?`;
  
  const result = await ctx.env.DB.prepare(query).bind(...values).run();

  if (result.success) {
    if (result.meta.changes === 0) {
      return jsonError('Article not found or no changes made', 404);
    }
    return jsonOk({ id, message: 'Article updated successfully' });
  }
  return jsonError('Failed to update article', 500);
}

/**
 * DELETE /api/admin/articles/:id
 * Delete an article and its comments.
 */
async function deleteArticle(ctx: RouteContext): Promise<Response> {
  const id = parseInt(ctx.params.id, 10);
  if (isNaN(id)) return jsonError('Invalid article ID', 400);

  const result = await ctx.env.DB
    .prepare('DELETE FROM articles WHERE id = ?')
    .bind(id)
    .run();

  if (result.success) {
    return jsonOk({ id, message: 'Article deleted successfully' });
  }
  return jsonError('Failed to delete article', 500);
}
