import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sanitizeArticleHtml } from '../src/lib/sanitizeArticleHtml';

describe('article HTML sanitization', () => {
  it('removes executable elements, event handlers, styles and dangerous URLs', () => {
    const clean = sanitizeArticleHtml(`
      <script>alert(1)</script>
      <img src="https://example.com/a.png" onerror="alert(1)" style="display:none">
      <a href="javascript:alert(1)">bad</a>
      <iframe src="https://evil.example"></iframe>
    `);

    expect(clean).not.toMatch(/<script|onerror|style=|javascript:|iframe/i);
    expect(clean).toContain('<img src="https://example.com/a.png" />');
  });

  it('keeps normal article markup and hardens external links', () => {
    const clean = sanitizeArticleHtml(`
      <h2>Title</h2><pre><code class="language-ts">const ok = true;</code></pre>
      <a href="https://example.com" target="attacker">external</a>
      <a href="/post/1" target="_blank">internal</a>
    `);

    expect(clean).toContain('class="language-ts"');
    expect(clean).toContain('target="_blank" rel="noopener noreferrer"');
    expect(clean).toContain('<a href="/post/1">internal</a>');
  });
});

describe('content security policy', () => {
  it('does not allow inline executable scripts or inline event attributes', () => {
    const headers = readFileSync('public/_headers', 'utf8');
    const scriptPolicy = headers.match(/script-src[^;]+/)?.[0] || '';
    expect(scriptPolicy).not.toContain("'unsafe-inline'");

    // Turnstile 人机验证需要 challenges.cloudflare.com；除此之外不允许第三方脚本与帧
    expect(headers).toContain('https://challenges.cloudflare.com');
    expect(headers).not.toMatch(/arcinks|arctan\.top/);

    const astroFiles: string[] = [];
    const walk = (directory: string) => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.astro')) astroFiles.push(path);
      }
    };
    walk('src');
    const source = astroFiles.map(path => readFileSync(path, 'utf8')).join('\n');
    expect(source).not.toMatch(/\son(?:click|load|error|submit|change|input|keydown)\s*=/i);
  });
});
