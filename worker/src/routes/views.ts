/**
 * Public view count endpoint.
 */
import type { RouteContext } from '../types';
import { jsonOk, jsonError, notFound } from '../utils/response';
import { Router } from '../router';
import { checkRateLimit } from '../utils/rateLimit';
import { RATE_LIMITS } from '../config/rateLimits';

/** Register view count routes on the given router. */
export function registerViewRoutes(router: Router): void {
  router.post('/api/public/articles/:id/views', incrementViews);
  router.get('/api/public/articles/:id/views', getViews);
}

/**
 * POST /api/blog/articles/:id/views
 * Atomically increment the view count for an article.
 * 超过 burst 限流后静默返回当前浏览量，不报错。
 */
async function incrementViews(ctx: RouteContext): Promise<Response> {
  const id = parseInt(ctx.params.id, 10);
  if (isNaN(id)) return jsonError('Invalid article ID', 400);

  const db = ctx.env.DB;

  // 频率限制（纯 burst，不弹验证码）
  const rateLimited = await checkRateLimit(ctx, RATE_LIMITS.article_view);
  if (rateLimited) {
    // 被限流了，静默返回当前浏览量，不 +1
    const row = await db
      .prepare('SELECT views FROM articles WHERE id = ? AND status = 1')
      .bind(id)
      .first<{ views: number }>();
    if (!row) return notFound('Article not found');
    return jsonOk({ views: row.views });
  }

  // Atomic increment – only for published articles
  const row = await db
    .prepare('UPDATE articles SET views = views + 1 WHERE id = ? AND status = 1 RETURNING views')
    .bind(id)
    .first<{ views: number }>();

  if (!row) {
    return notFound('Article not found');
  }

  return jsonOk({ views: row.views });
}

/**
 * GET /api/public/articles/:id/views
 * Get current views count without incrementing.
 */
async function getViews(ctx: RouteContext): Promise<Response> {
  const id = parseInt(ctx.params.id, 10);
  if (isNaN(id)) return jsonError('Invalid article ID', 400);

  const db = ctx.env.DB;
  const row = await db
    .prepare('SELECT views FROM articles WHERE id = ? AND status = 1')
    .bind(id)
    .first<{ views: number }>();

  if (!row) return notFound('Article not found');
  return jsonOk({ views: row.views });
}
