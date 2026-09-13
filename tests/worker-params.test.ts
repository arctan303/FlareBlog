import { describe, expect, it } from 'vitest';
import { parsePositiveInt } from '../worker/src/utils/params';
import { Router } from '../worker/src/router';

describe('parsePositiveInt', () => {
  it('parses valid integers and clamps to max', () => {
    expect(parsePositiveInt('5')).toBe(5);
    expect(parsePositiveInt('5', 1, 3)).toBe(3);
    expect(parsePositiveInt(null)).toBe(1);
    expect(parsePositiveInt(null, 20)).toBe(20);
  });

  it('clamps 0 and negatives to 1 (matches original Math.max semantics)', () => {
    expect(parsePositiveInt('0')).toBe(1);
    expect(parsePositiveInt('-5')).toBe(1);
  });

  it('falls back to default for non-numeric input instead of NaN', () => {
    expect(parsePositiveInt('abc')).toBe(1);
    expect(parsePositiveInt('abc', 20)).toBe(20);
    expect(parsePositiveInt('')).toBe(1);
    expect(parsePositiveInt('12abc')).toBe(12); // parseInt 前缀解析
  });
});

describe('router param decoding', () => {
  it('returns params without throwing on malformed percent-encoding', () => {
    const router = new Router();
    router.get('/api/public/articles/:id/comments', () => new Response('ok'));

    const result = router.match('GET', '/api/public/articles/%E0%A4%A/comments');
    expect(result).not.toBeNull();
    // decodeURIComponent('%E0%A4%A') 会抛 URIError，捕获后按原始字面量处理
    expect(result?.params.id).toBe('%E0%A4%A');
  });

  it('decodes a valid encoded param', () => {
    const router = new Router();
    router.get('/api/public/articles/:id/comments', () => new Response('ok'));

    const result = router.match('GET', '/api/public/articles/13/comments');
    expect(result?.params.id).toBe('13');
  });
});
