import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../worker/src/index';
import { checkRateLimit } from '../worker/src/utils/rateLimit';
import type { RateLimitRule } from '../worker/src/config/rateLimits';
import { readLimitedJson, RequestBodyTooLargeError } from '../worker/src/utils/body';

afterEach(() => vi.unstubAllGlobals());

function executionContext(): ExecutionContext {
  return {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
    props: {},
  } as unknown as ExecutionContext;
}

describe('authenticated build snapshot', () => {
  it('rejects a missing build token before querying D1', async () => {
    let queried = false;
    const env = {
      BUILD_API_TOKEN: 'expected-token',
      DB: { prepare: () => { queried = true; throw new Error('must not query'); } },
    } as unknown as import('../worker/src/types').Env;

    const response = await worker.fetch(
      new Request('https://blog-api.example/api/build/site-data'),
      env,
      executionContext(),
    );

    expect(response.status).toBe(403);
    expect(queried).toBe(false);
  });

  it('returns only the explicit build snapshot fields for a valid token', async () => {
    const queries: string[] = [];
    const env = {
      BUILD_API_TOKEN: 'expected-token',
      DB: {
        prepare(sql: string) {
          queries.push(sql);
          return {
            async all() {
              return sql.includes('FROM comments c')
                ? { results: [{ id: 2, article_id: 1, username: 'reader', content: 'ok', status: 1, created_at: 2 }] }
                : { results: [{ id: 1, title: 'post', content: 'body', status: 1 }] };
            },
          };
        },
      },
    } as unknown as import('../worker/src/types').Env;

    const response = await worker.fetch(
      new Request('https://blog-api.example/api/build/site-data', {
        headers: { 'x-build-token': 'expected-token' },
      }),
      env,
      executionContext(),
    );
    const data = await response.json() as {
      articles: Array<Record<string, unknown>>;
      comments: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(data.articles).toHaveLength(1);
    expect(data.articles[0]).not.toHaveProperty('song');
    expect(data.comments[0]).not.toHaveProperty('email');
    expect(queries.join('\n')).toContain('WHERE status = 1');
    expect(queries.join('\n')).toContain('c.status = 1 AND a.status = 1');
  });

  it('returns a single published article for a valid build token', async () => {
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => null),
        put: vi.fn(async () => undefined),
      },
    });
    const env = {
      BUILD_API_TOKEN: 'expected-token',
      DB: {
        prepare() {
          return {
            bind() { return this; },
            async first() {
              return { id: 1, title: 'post', content: 'body', status: 1 };
            },
          };
        },
      },
    } as unknown as import('../worker/src/types').Env;

    const response = await worker.fetch(
      new Request('https://blog-api.example/api/build/articles/1', {
        headers: { 'x-build-token': 'expected-token' },
      }),
      env,
      executionContext(),
    );
    const article = await response.json() as { id: number; title: string };

    expect(response.status).toBe(200);
    expect(article.id).toBe(1);
    expect(article.title).toBe('post');
  });
});

describe('admin article metadata updates', () => {
  it('allows PATCH in browser preflight responses', async () => {
    const response = await worker.fetch(
      new Request('https://blog-api.example/api/admin/articles/52', {
        method: 'OPTIONS',
        headers: { origin: 'https://admin.example' },
      }),
      {
        CORS_ORIGINS: 'https://admin.example',
      } as import('../worker/src/types').Env,
      executionContext(),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toContain('PATCH');
  });

  it('includes the last editor in article table rows', async () => {
    const env = {
      ADMIN_API_KEY: 'admin-secret',
      DB: {
        prepare(sql: string) {
          return {
            bind() {
              return this;
            },
            async first() {
              return { total: 1 };
            },
            async all() {
              expect(sql).toContain('last_editor');
              return {
                results: [{
                  id: 52,
                  title: 'post',
                  summary: null,
                  category: 'tech',
                  author: 'author',
                  last_editor: 'editor',
                  status: 1,
                  is_pinned: 0,
                  views: 10,
                  created_at: 1,
                  updated_at: 2,
                }],
              };
            },
          };
        },
      },
    } as unknown as import('../worker/src/types').Env;

    const response = await worker.fetch(
      new Request('https://blog-api.example/api/admin/articles', {
        headers: { 'x-admin-api-key': 'admin-secret' },
      }),
      env,
      executionContext(),
    );
    const body = await response.json() as { data: Array<{ last_editor: string | null }> };

    expect(response.status).toBe(200);
    expect(body.data[0].last_editor).toBe('editor');
  });

  it('supports PATCH updates that clear the last editor', async () => {
    let query = '';
    let values: unknown[] = [];
    const env = {
      ADMIN_API_KEY: 'admin-secret',
      DB: {
        prepare(sql: string) {
          query = sql;
          return {
            bind(...boundValues: unknown[]) {
              values = boundValues;
              return this;
            },
            async run() {
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      },
    } as unknown as import('../worker/src/types').Env;

    const response = await worker.fetch(
      new Request('https://blog-api.example/api/admin/articles/52', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-admin-api-key': 'admin-secret',
        },
        body: JSON.stringify({ last_editor: '   ' }),
      }),
      env,
      executionContext(),
    );

    expect(response.status).toBe(200);
    expect(query).toContain('last_editor = ?');
    expect(values[0]).toBeNull();
    expect(values.at(-1)).toBe(52);
  });
});

describe('worker rate limit fallback behavior', () => {
  it('blocks after the configured burst allowance', async () => {
    const state = { minute_count: 0, daily_count: 0 };
    const env = {
      DB: {
        prepare(sql: string) {
          return {
            bind() { return this; },
            async first() {
              if (!sql.includes('INSERT INTO rate_limits')) return null;
              state.minute_count += 1;
              state.daily_count += 1;
              return {
                ...state,
                minute_reset_at: Math.floor(Date.now() / 1000) + 60,
                daily_reset_at: Math.floor(Date.now() / 1000) + 86400,
              };
            },
            async run() { return { success: true }; },
          };
        },
      },
    } as unknown as import('../worker/src/types').Env;
    const rule: RateLimitRule = {
      action: 'test', burstLimit: 2, burstSeconds: 60,
      dailyFree: 100, needCaptcha: false, resetOnCaptcha: false,
    };
    const context = {
      request: new Request('https://blog-api.example/test', {
        headers: { 'cf-connecting-ip': '203.0.113.1' },
      }),
      env,
      executionCtx: executionContext(),
      params: {},
    };

    expect(await checkRateLimit(context, rule)).toBeNull();
    expect(await checkRateLimit(context, rule)).toBeNull();
    expect((await checkRateLimit(context, rule))?.status).toBe(429);
  });
});

describe('bounded JSON request parsing', () => {
  it('parses a body below the byte limit', async () => {
    const request = new Request('https://blog-api.example/test', {
      method: 'POST',
      body: JSON.stringify({ ok: true }),
    });
    await expect(readLimitedJson(request, 64)).resolves.toEqual({ ok: true });
  });

  it('rejects an oversized streamed body even without Content-Length', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"content":"too large"}'));
        controller.close();
      },
    });
    const requestInit = {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' };
    const request = new Request('https://blog-api.example/test', requestInit);
    await expect(readLimitedJson(request, 8)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });
});
