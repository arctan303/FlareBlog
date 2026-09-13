import type { RouteContext, RouteHandler } from '../types';

/**
 * Cache middleware using Cloudflare Cache API.
 * Wraps a route handler and caches the response.
 */
export function withCache(handler: RouteHandler, ttlSeconds: number): RouteHandler {
  return async (ctx: RouteContext): Promise<Response> => {
    // Only cache GET requests
    if (ctx.request.method !== 'GET') {
      return handler(ctx);
    }

    const cache = (caches as any).default;
    // The request object includes query parameters, which form part of the cache key.
    // However, if the client sets headers that shouldn't affect the cache, it's safer to use the URL.
    const cacheKey = new Request(ctx.request.url, { method: 'GET' });

    // Check if the response is in cache
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Call the original handler
    const response = await handler(ctx);

    // Only cache 200 OK responses
    if (response.status === 200) {
      const cloned = response.clone();
      const headers = new Headers(cloned.headers);
      headers.set('Cache-Control', `public, max-age=${ttlSeconds}`);
      
      const cached = new Response(cloned.body, {
        status: cloned.status,
        statusText: cloned.statusText,
        headers
      });

      // Write to cache asynchronously without blocking the response
      ctx.executionCtx.waitUntil(cache.put(cacheKey, cached));
      
      // Also return the original response with the cache header so edge/browser knows
      const finalHeaders = new Headers(response.headers);
      finalHeaders.set('Cache-Control', `public, max-age=${ttlSeconds}`);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: finalHeaders
      });
    }

    return response;
  };
}
