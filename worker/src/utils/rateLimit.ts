import type { RouteContext } from '../types';
import type { RateLimitRule } from '../config/rateLimits';
import { jsonError } from './response';

interface RateLimitState {
  minuteCount: number;
  minuteResetAt: number;
  dailyCount: number;
  dailyResetAt: number;
}

interface StoredRateLimitState {
  minute_count: number;
  minute_reset_at: number;
  daily_count: number;
  daily_reset_at: number;
}

const SECONDS_PER_DAY = 86400;

// Fallback only. D1 is the production source of truth so limits survive Worker
// isolate changes and concurrent traffic.
const memoryCache = new Map<string, RateLimitState>();

function getClientIp(ctx: RouteContext): string {
  return (
    ctx.request.headers.get('cf-connecting-ip') ||
    ctx.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1'
  );
}

async function incrementPersistentState(
  ctx: RouteContext,
  ip: string,
  rule: RateLimitRule,
  now: number,
): Promise<RateLimitState> {
  const row = await ctx.env.DB.prepare(`
    INSERT INTO rate_limits (
      ip, action, minute_count, minute_reset_at, daily_count, daily_reset_at
    ) VALUES (?1, ?2, 1, ?3, 1, ?4)
    ON CONFLICT(ip, action) DO UPDATE SET
      minute_count = CASE
        WHEN rate_limits.minute_reset_at <= ?5 THEN 1
        ELSE rate_limits.minute_count + 1
      END,
      minute_reset_at = CASE
        WHEN rate_limits.minute_reset_at <= ?5 THEN excluded.minute_reset_at
        ELSE rate_limits.minute_reset_at
      END,
      daily_count = CASE
        WHEN rate_limits.daily_reset_at <= ?5 THEN 1
        ELSE rate_limits.daily_count + 1
      END,
      daily_reset_at = CASE
        WHEN rate_limits.daily_reset_at <= ?5 THEN excluded.daily_reset_at
        ELSE rate_limits.daily_reset_at
      END
    RETURNING minute_count, minute_reset_at, daily_count, daily_reset_at
  `).bind(
    ip,
    rule.action,
    now + rule.burstSeconds,
    now + SECONDS_PER_DAY,
    now,
  ).first<StoredRateLimitState>();

  if (!row) throw new Error('Rate limit counter update returned no row');
  return {
    minuteCount: row.minute_count,
    minuteResetAt: row.minute_reset_at,
    dailyCount: row.daily_count,
    dailyResetAt: row.daily_reset_at,
  };
}

function nextState(previous: RateLimitState | null, rule: RateLimitRule, now: number): RateLimitState {
  if (!previous) {
    return {
      minuteCount: 1,
      minuteResetAt: now + rule.burstSeconds,
      dailyCount: 1,
      dailyResetAt: now + SECONDS_PER_DAY,
    };
  }

  const minuteExpired = now > previous.minuteResetAt;
  const dailyExpired = now > previous.dailyResetAt;

  return {
    minuteCount: minuteExpired ? 1 : previous.minuteCount + 1,
    minuteResetAt: minuteExpired ? now + rule.burstSeconds : previous.minuteResetAt,
    dailyCount: dailyExpired ? 1 : previous.dailyCount + 1,
    dailyResetAt: dailyExpired ? now + SECONDS_PER_DAY : previous.dailyResetAt,
  };
}

async function verifyTurnstile(ctx: RouteContext, token: string, ip: string): Promise<boolean | Response> {
  const secretKey = ctx.env.TURNSTILE_SECRET_KEY || '';
  if (!secretKey) {
    console.warn('TURNSTILE_SECRET_KEY is not configured.');
    return jsonError('CAPTCHA is not configured. Please try again later.', 503);
  }

  const verifyData = new FormData();
  verifyData.append('secret', secretKey);
  verifyData.append('response', token);
  verifyData.append('remoteip', ip);

  try {
    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: verifyData,
    });
    const verifyOutcome = await verifyRes.json() as { success?: boolean };
    return verifyOutcome.success === true;
  } catch (err) {
    console.warn('Turnstile validation request failed:', err);
    return jsonError('CAPTCHA validation unavailable. Please try again later.', 503);
  }
}

function captchaResponse(status: number, message: string): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  };
  return new Response(JSON.stringify({
    error: 'requires_captcha',
    require_captcha: true,
    message,
  }), { status, headers });
}

export async function checkRateLimit(
  ctx: RouteContext,
  rule: RateLimitRule,
  turnstileToken: string | null = null
): Promise<Response | null> {
  const ip = getClientIp(ctx);
  const now = Math.floor(Date.now() / 1000);
  const cacheKey = `${ip}:${rule.action}`;

  let persistentStoreAvailable = true;
  let state: RateLimitState;

  try {
    state = await incrementPersistentState(ctx, ip, rule, now);
  } catch (err) {
    persistentStoreAvailable = false;
    state = nextState(memoryCache.get(cacheKey) || null, rule, now);
    memoryCache.set(cacheKey, state);
    console.warn('D1 rate limit store unavailable, falling back to isolate memory:', err);
  }

  if (state.minuteCount > rule.burstLimit) {
    return rule.needCaptcha && ctx.env.TURNSTILE_SECRET_KEY
      ? captchaResponse(429, 'Too many requests. Please wait or complete verification.')
      : jsonError('Too Many Requests. Please wait a minute.', 429);
  }

  // Turnstile 密钥未配置时跳过人机验证（零配置起步），仅保留限流防护。
  if (rule.needCaptcha && state.dailyCount > rule.dailyFree && ctx.env.TURNSTILE_SECRET_KEY) {
    if (!turnstileToken) {
      return captchaResponse(403, 'Daily free limit exceeded. Please complete the CAPTCHA.');
    }

    const verified = await verifyTurnstile(ctx, turnstileToken, ip);
    if (verified instanceof Response) return verified;

    if (!verified) {
      return new Response(JSON.stringify({
        error: 'invalid_captcha',
        require_captcha: true,
        message: 'CAPTCHA validation failed. Please try again.',
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    if (rule.resetOnCaptcha) {
      const resetState = {
        minuteCount: 1,
        minuteResetAt: now + rule.burstSeconds,
        dailyCount: 1,
        dailyResetAt: state.dailyResetAt,
      };
      if (persistentStoreAvailable) {
        try {
          // Do not overwrite increments that arrived while CAPTCHA was being verified.
          await ctx.env.DB.prepare(`
            UPDATE rate_limits
            SET minute_count = 1, minute_reset_at = ?, daily_count = 1
            WHERE ip = ? AND action = ? AND minute_count = ? AND daily_count = ?
          `).bind(
            resetState.minuteResetAt,
            ip,
            rule.action,
            state.minuteCount,
            state.dailyCount,
          ).run();
        } catch (err) {
          console.warn('Failed to reset rate limit after CAPTCHA:', err);
        }
      } else {
        memoryCache.set(cacheKey, resetState);
      }
      state = resetState;
    }
  }

  if (Math.random() < 0.01) {
    for (const [key, value] of memoryCache.entries()) {
      if (now > value.dailyResetAt && now > value.minuteResetAt) {
        memoryCache.delete(key);
      }
    }
    if (persistentStoreAvailable) {
      ctx.executionCtx.waitUntil(
        ctx.env.DB.prepare('DELETE FROM rate_limits WHERE daily_reset_at <= ?')
          .bind(now)
          .run()
          .then(() => undefined)
          .catch(err => console.warn('Failed to clean expired rate limits:', err))
      );
    }
  }

  return null;
}
