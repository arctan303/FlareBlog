/**
 * JSON response helpers for consistent API output.
 */

const JSON_HEADERS: HeadersInit = {
  'Content-Type': 'application/json; charset=utf-8',
};

const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy': "default-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

export function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    secured.headers.set(key, value);
  }
  return secured;
}

/** Return a successful JSON response. */
export function jsonOk<T>(data: T, status = 200): Response {
  return withSecurityHeaders(new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  }));
}

/** Return an error JSON response. */
export function jsonError(message: string, status = 400): Response {
  return withSecurityHeaders(new Response(JSON.stringify({ error: message }), {
    status,
    headers: JSON_HEADERS,
  }));
}

/** Return a 404 Not Found response. */
export function notFound(message = 'Not found'): Response {
  return jsonError(message, 404);
}
