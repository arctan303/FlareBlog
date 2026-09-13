/**
 * Admin Comments endpoints.
 */
import type { RouteContext, PaginatedResponse, AdminCommentItem } from '../../types';
import { jsonOk, jsonError } from '../../utils/response';
import { Router } from '../../router';
import { parsePositiveInt } from '../../utils/params';

/** Register admin comments routes on the given router. */
export function registerAdminCommentRoutes(router: Router): void {
  router.get('/api/admin/comments', listCommentsAdmin);
  router.put('/api/admin/comments/:id/status', updateCommentStatus);
  router.patch('/api/admin/comments/:id/status', updateCommentStatus);
  router.patch('/api/admin/comments/:id', updateCommentStatus);
  router.delete('/api/admin/comments/:id', deleteComment);
}

/**
 * GET /api/admin/comments
 * List comments, with optional filtering by status or article_id.
 * Query params:
 *  - status: 0 (pending), 1 (approved), 2 (rejected). If omitted, returns all.
 *  - article_id: optional
 */
async function listCommentsAdmin(ctx: RouteContext): Promise<Response> {
  const url = new URL(ctx.request.url);
  const page = parsePositiveInt(url.searchParams.get('page'));
  const limit = parsePositiveInt(url.searchParams.get('limit'), 20, 100);
  const offset = (page - 1) * limit;

  const statusQuery = url.searchParams.get('status');
  const articleIdQuery = url.searchParams.get('article_id');

  let whereClauses: string[] = [];
  let values: any[] = [];

  if (statusQuery !== null) {
    whereClauses.push('c.status = ?');
    values.push(parseInt(statusQuery, 10));
  }
  if (articleIdQuery !== null) {
    whereClauses.push('c.article_id = ?');
    values.push(parseInt(articleIdQuery, 10));
  }

  let whereSql = '';
  if (whereClauses.length > 0) {
    whereSql = 'WHERE ' + whereClauses.join(' AND ');
  }

  const countQuery = `SELECT COUNT(*) as total FROM comments c ${whereSql}`;
  const countResult = await ctx.env.DB.prepare(countQuery).bind(...values).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const rowsQuery = `
    SELECT 
      c.id, c.article_id, a.title AS article_title,
      c.username, c.email, c.content, c.status, c.created_at,
      c.ip, c.user_agent
    FROM comments c
    LEFT JOIN articles a ON c.article_id = a.id
    ${whereSql}
    ORDER BY c.id DESC
    LIMIT ? OFFSET ?
  `;
  const rows = await ctx.env.DB.prepare(rowsQuery).bind(...values, limit, offset).all<AdminCommentItem>();

  const response: PaginatedResponse<AdminCommentItem> = {
    data: rows.results,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };

  return jsonOk(response);
}


/**
 * PUT /api/admin/comments/:id/status
 * Update the status of a specific comment.
 * Body: { "status": 1 } (0=pending, 1=approved, 2=rejected)
 */
async function updateCommentStatus(ctx: RouteContext): Promise<Response> {
  const id = parseInt(ctx.params.id, 10);
  if (isNaN(id)) return jsonError('Invalid comment ID', 400);

  let body: { status: number };
  try {
    body = await ctx.request.json<{ status: number }>();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  if (body.status === undefined || ![0, 1, 2].includes(body.status)) {
    return jsonError('Valid status (0, 1, 2) is required', 400);
  }

  const result = await ctx.env.DB
    .prepare('UPDATE comments SET status = ? WHERE id = ?')
    .bind(body.status, id)
    .run();

  if (result.success && result.meta.changes > 0) {
    return jsonOk({ id, status: body.status, message: 'Comment status updated' });
  }
  return jsonError('Failed to update comment or comment not found', 500);
}

/**
 * DELETE /api/admin/comments/:id
 * Delete a comment permanently.
 */
async function deleteComment(ctx: RouteContext): Promise<Response> {
  const id = parseInt(ctx.params.id, 10);
  if (isNaN(id)) return jsonError('Invalid comment ID', 400);

  const result = await ctx.env.DB
    .prepare('DELETE FROM comments WHERE id = ?')
    .bind(id)
    .run();

  if (result.success && result.meta.changes > 0) {
    return jsonOk({ id, message: 'Comment deleted successfully' });
  }
  return jsonError('Failed to delete comment or comment not found', 500);
}
