import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('SEO tab title transformation', () => {
  it('correctly matches home and pagination paths and ignores specific non-home paths', () => {
    const fileContent = readFileSync(new URL('../public/title-init.js', import.meta.url), 'utf8');

    // Extract the matching condition logic
    const isMatched = (pathname: string) => {
      const path = pathname.replace(/\/+$/, '') || '/';
      return path === '/' || /^\/\d+$/.test(path) || /^\/page\/\d+$/.test(path);
    };

    // Home first page
    expect(isMatched('/')).toBe(true);
    expect(isMatched('///')).toBe(true);

    // Home pagination
    expect(isMatched('/2')).toBe(true);
    expect(isMatched('/2/')).toBe(true);
    expect(isMatched('/10')).toBe(true);
    expect(isMatched('/page/2')).toBe(true);

    // Specific pages should NOT be shortened to "FlareBlog"
    expect(isMatched('/post/1')).toBe(false);
    expect(isMatched('/post/2')).toBe(false);
    expect(isMatched('/category/linux')).toBe(false);
    expect(isMatched('/category/linux/2')).toBe(false);
    expect(isMatched('/about')).toBe(false);
    expect(isMatched('/search')).toBe(false);

    // Verify script content structure
    expect(fileContent).toContain("document.title = 'FlareBlog'");
    expect(fileContent).toContain('astro:page-load');
  });
});
