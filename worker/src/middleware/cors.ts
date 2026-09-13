/**
 * CORS middleware – reads allowed origins from CORS_ORIGINS env var.
 */

import type { Env } from '../types';

function getAllowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;

  // Allowed origins from environment variable (comma-separated)
  if (env.CORS_ORIGINS) {
    const origins = env.CORS_ORIGINS.split(',').map(s => s.trim());
    if (origins.includes(origin)) return origin;
  }

  return null;
}

function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-api-key, x-build-token',
    'Access-Control-Max-Age': '86400',
  };
}

/** Handle CORS preflight. Returns a Response if this is an OPTIONS request, otherwise null. */
export function handlePreflight(request: Request, env: Env): Response | null {
  if (request.method !== 'OPTIONS') return null;
  const origin = getAllowedOrigin(request, env);
  if (!origin) {
    return new Response(null, { status: 204 });
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

/** Attach CORS headers to an existing response. Returns a new Response with headers added. */
export function withCors(request: Request, response: Response, env: Env): Response {
  const origin = getAllowedOrigin(request, env);
  if (!origin) return response;

  const newResponse = new Response(response.body, response);
  const headers = corsHeaders(origin);
  for (const [key, value] of Object.entries(headers)) {
    newResponse.headers.set(key, value);
  }
  return newResponse;
}
