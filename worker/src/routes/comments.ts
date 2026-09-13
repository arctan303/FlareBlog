/**
 * Public comment endpoints.
 */
import type { RouteContext, CommentRow, PaginatedResponse, CreateCommentBody } from '../types';
import { jsonOk, jsonError, notFound } from '../utils/response';
import { Router } from '../router';
import { checkRateLimit } from '../utils/rateLimit';
import { RATE_LIMITS } from '../config/rateLimits';
import { readLimitedJson, RequestBodyTooLargeError } from '../utils/body';
import { parsePositiveInt } from '../utils/params';

const MAX_USERNAME_CHARS = 50;
const MAX_EMAIL_CHARS = 100;
const MAX_COMMENT_CHARS = 2000;

import { withCache } from '../middleware/cache';

/** Register public comment routes on the given router. */
export function registerCommentRoutes(router: Router): void {
  router.get('/api/build/articles/:id/comments', withCache(listComments, 300)); // 5 mins
  router.get('/api/public/articles/:id/comments', withCache(listComments, 60)); // 1 min
  router.post('/api/public/articles/:id/comments', createComment);
}

/**
 * GET /api/build/articles/:id/comments
 * List approved comments for an article, paginated.
 * Query params: page (default 1), limit (default 20, max 100)
 */
async function listComments(ctx: RouteContext): Promise<Response> {
  const articleId = parseInt(ctx.params.id, 10);
  if (isNaN(articleId)) return jsonError('Invalid article ID', 400);

  const url = new URL(ctx.request.url);
  const page = parsePositiveInt(url.searchParams.get('page'));
  const limit = parsePositiveInt(url.searchParams.get('limit'), 20, 100);
  const offset = (page - 1) * limit;

  const db = ctx.env.DB;

  // Verify article exists and is published
  const article = await db
    .prepare('SELECT id FROM articles WHERE id = ? AND status = 1')
    .bind(articleId)
    .first();
  if (!article) return notFound('Article not found');

  // Count approved comments
  const countResult = await db
    .prepare('SELECT COUNT(*) as total FROM comments WHERE article_id = ? AND status = 1')
    .bind(articleId)
    .first<{ total: number }>();
  const total = countResult?.total ?? 0;

  // Fetch page
  const rows = await db
    .prepare(
      `SELECT id, article_id, username, content, created_at
       FROM comments
       WHERE article_id = ? AND status = 1
       ORDER BY created_at ASC
       LIMIT ? OFFSET ?`
    )
    .bind(articleId, limit, offset)
    .all<Pick<CommentRow, 'id' | 'article_id' | 'username' | 'content' | 'created_at'>>();

  const response: PaginatedResponse<Pick<CommentRow, 'id' | 'article_id' | 'username' | 'content' | 'created_at'>> = {
    data: rows.results,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };

  return jsonOk(response);
}

/**
 * POST /api/public/articles/:id/comments
 * Submit a new comment. Comments are published immediately (status = 1);
 * spam protection relies on Turnstile, IP rate limiting and a global daily cap.
 */
async function createComment(ctx: RouteContext): Promise<Response> {
  const articleId = parseInt(ctx.params.id, 10);
  if (isNaN(articleId)) return jsonError('Invalid article ID', 400);

  const db = ctx.env.DB;

  // Verify article exists and is published
  const article = await db
    .prepare('SELECT id FROM articles WHERE id = ? AND status = 1')
    .bind(articleId)
    .first<{ id: number }>();
  if (!article) return notFound('Article not found');

  let body: CreateCommentBody & { cf_turnstile_response?: string };
  try {
    body = await readLimitedJson(ctx.request, 16 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonError('Request body too large', 413);
    }
    return jsonError('Invalid JSON body', 400);
  }

  // 频率限制 + 人机验证
  const rateLimitResponse = await checkRateLimit(ctx, RATE_LIMITS.comment_post, body.cf_turnstile_response || null);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // 全局每日评论上限检查（基于东八区时间计算当天的起始时间）
  const limitStr = ctx.env.GLOBAL_DAILY_COMMENT_LIMIT || '50';
  const globalLimit = parseInt(limitStr, 10);
  
  if (globalLimit > 0) {
    const nowMs = Date.now();
    const offsetMs = 8 * 60 * 60 * 1000; // UTC+8
    const todayStartSeconds = Math.floor(((nowMs + offsetMs) - ((nowMs + offsetMs) % 86400000)) - offsetMs) / 1000;

    const globalCountRes = await db
      .prepare('SELECT COUNT(*) as total FROM comments WHERE created_at >= ?')
      .bind(todayStartSeconds)
      .first<{ total: number }>();

    if (globalCountRes && globalCountRes.total >= globalLimit) {
      return jsonError('今日全站评论总数已达上限，请明天再来。', 429);
    }
  }

  // Validate required fields
  if (!body.username || typeof body.username !== 'string' || !body.username.trim()) {
    return jsonError('username is required', 400);
  }
  if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
    return jsonError('content is required', 400);
  }

  // Limit field lengths
  const username = body.username.trim().slice(0, MAX_USERNAME_CHARS);
  const content = body.content.trim().slice(0, MAX_COMMENT_CHARS);
  const email = body.email?.trim().slice(0, MAX_EMAIL_CHARS) || null;
  const now = Math.floor(Date.now() / 1000);

  const ip = ctx.request.headers.get('cf-connecting-ip') || ctx.request.headers.get('x-real-ip') || null;
  const userAgent = ctx.request.headers.get('user-agent') || null;

  // 评论直接通过：防垃圾依赖 Turnstile 人机验证、IP 限流与全站每日上限。
  const initialStatus = 1;

  const result = await db
    .prepare(
      `INSERT INTO comments (article_id, username, email, content, status, created_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(articleId, username, email, content, initialStatus, now, ip, userAgent)
    .run();

  return jsonOk(
    { id: result.meta.last_row_id, message: 'Comment submitted', status: initialStatus },
    201
  );
}
