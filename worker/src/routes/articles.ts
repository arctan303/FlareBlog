/**
 * Public article endpoints.
 */
import type { RouteContext, ArticleRow, ArticleListItem, CommentRow, PaginatedResponse } from '../types';
import { jsonOk, jsonError, notFound } from '../utils/response';
import { Router } from '../router';

import { withCache } from '../middleware/cache';
import { parsePositiveInt } from '../utils/params';

/** Register public article routes on the given router. */
export function registerArticleRoutes(router: Router): void {
  router.get('/api/build/site-data', getBuildSiteData);
  router.get('/api/build/articles', withCache(listArticles, 300)); // 5 mins
  router.get('/api/build/articles/:id', withCache(getArticle, 1800)); // 30 mins
  router.get('/api/public/articles', withCache(listArticles, 60)); // 1 min
}

/**
 * GET /api/build/articles
 * List published articles with pagination and optional category filter.
 * Query params: page (default 1), limit (default 10, max 100), category
 * Sorted by is_pinned DESC, created_at DESC.
 * Omits heavy fields (content, html_cache) for list performance.
 */
async function listArticles(ctx: RouteContext): Promise<Response> {
  const url = new URL(ctx.request.url);
  const maxLimit = url.pathname.startsWith('/api/build/') ? 10_000 : 100;
  const page = parsePositiveInt(url.searchParams.get('page'));
  const limit = parsePositiveInt(url.searchParams.get('limit'), 10, maxLimit);
  const category = url.searchParams.get('category');
  const excludeCategory = url.searchParams.get('exclude_category');
  const offset = (page - 1) * limit;

  const db = ctx.env.DB;

  // Build WHERE clause
  const conditions: string[] = ['a.status = 1'];
  const bindValues: unknown[] = [];

  if (category) {
    conditions.push("(',' || a.category || ',') LIKE ('%,' || ? || ',%')");
    bindValues.push(category);
  }

  if (excludeCategory) {
    conditions.push("(',' || a.category || ',') NOT LIKE ('%,' || ? || ',%')");
    bindValues.push(excludeCategory);
  }

  const whereClause = conditions.join(' AND ');

  // Count total
  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM articles a WHERE ${whereClause}`)
    .bind(...bindValues)
    .first<{ total: number }>();
  const total = countResult?.total ?? 0;

  // Fetch page
  const rows = await db
    .prepare(
      `SELECT id, title, summary, category, author, status, is_pinned, views, created_at, updated_at
       FROM articles a
       WHERE ${whereClause}
       ORDER BY is_pinned DESC, created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...bindValues, limit, offset)
    .all<ArticleListItem>();

  const response: PaginatedResponse<ArticleListItem> = {
    data: rows.results,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };

  return jsonOk(response);
}

/**
 * Return one authenticated build snapshot to avoid one API request per page.
 * Only published articles and approved public comment fields are included.
 */
async function getBuildSiteData(ctx: RouteContext): Promise<Response> {
  const [articles, comments] = await Promise.all([
    ctx.env.DB.prepare(`
      SELECT id, title, content, html_cache, summary, category, author, last_editor, status,
             is_pinned, views, created_at, updated_at
      FROM articles
      WHERE status = 1
      ORDER BY is_pinned DESC, created_at DESC
    `).all<ArticleRow>(),
    ctx.env.DB.prepare(`
      SELECT c.id, c.article_id, c.username, c.content, c.status, c.created_at
      FROM comments c
      INNER JOIN articles a ON a.id = c.article_id
      WHERE c.status = 1 AND a.status = 1
      ORDER BY c.article_id, c.created_at ASC
    `).all<Pick<CommentRow, 'id' | 'article_id' | 'username' | 'content' | 'status' | 'created_at'>>(),
  ]);

  return jsonOk({
    articles: articles.results,
    comments: comments.results,
  });
}

/**
 * GET /api/build/articles/:id
 * Get a single published article by ID (includes full content).
 */
async function getArticle(ctx: RouteContext): Promise<Response> {
  const id = parseInt(ctx.params.id, 10);
  if (isNaN(id)) return jsonError('Invalid article ID', 400);

  const article = await ctx.env.DB
    .prepare('SELECT * FROM articles WHERE id = ? AND status = 1')
    .bind(id)
    .first<ArticleRow>();

  if (!article) return notFound('Article not found');
  return jsonOk(article);
}
