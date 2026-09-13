/**
 * Cloudflare Worker entry point – FlareBlog API.
 *
 * Wires up the router, CORS middleware, and all route modules.
 */
import type { Env } from './types';
import { Router } from './router';
import { handlePreflight, withCors } from './middleware/cors';
import { notFound, withSecurityHeaders, jsonError } from './utils/response';

import { registerArticleRoutes } from './routes/articles';
import { registerCommentRoutes } from './routes/comments';
import { registerViewRoutes } from './routes/views';
import { registerCategoryRoutes } from './routes/categories';
import { registerAdminRoutes } from './routes/admin';
// Build the router once at module scope (reused across requests)
const router = new Router();

registerArticleRoutes(router);
registerCommentRoutes(router);
registerViewRoutes(router);
registerCategoryRoutes(router);
registerAdminRoutes(router);
export default {
  async fetch(request: Request, env: Env, executionCtx: ExecutionContext): Promise<Response> {
    // Handle CORS preflight
    const preflightResponse = handlePreflight(request, env);
    if (preflightResponse) {
      return withSecurityHeaders(withCors(request, preflightResponse, env));
    }

    // Route the request
    let response: Response;
    try {
      // Validate build-only API token
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/build/')) {
        const token = request.headers.get('x-build-token');
        if (!env.BUILD_API_TOKEN || token !== env.BUILD_API_TOKEN) {
          return withSecurityHeaders(withCors(request, jsonError('Forbidden', 403), env));
        }
      }

      // Validate Admin API Key
      if (url.pathname.startsWith('/api/admin/')) {
        const adminKey = request.headers.get('x-admin-api-key');
        if (!env.ADMIN_API_KEY || adminKey !== env.ADMIN_API_KEY) {
          return withSecurityHeaders(withCors(request, jsonError('Forbidden: Invalid Admin API Key', 403), env));
        }
      }

      const matched = await router.resolve(request, env, executionCtx);
      response = matched ?? notFound('Endpoint not found');
    } catch (err) {
      console.error('Unhandled error:', err);
      const isLocalWorker = ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname);
      const message = isLocalWorker 
        ? (err instanceof Error ? err.message : 'Internal server error')
        : 'Internal server error. Please try again later.';
      response = new Response(
        JSON.stringify({ error: message }),
        { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    // Attach CORS headers
    return withSecurityHeaders(withCors(request, response, env));
  },
};
