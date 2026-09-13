import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  calculatePanBounds,
  canOpenArticleImage,
  clampPanOffset,
  clampZoomScale,
  decodeArticleImageAttribute,
  getArticleImageDescription,
  getNextZoomScale,
  isMeaningfulArticleImageDescription,
} from '../src/lib/articleImageLightbox';

describe('article image lightbox description', () => {
  it('prefers title and falls back to meaningful alt text', () => {
    expect(getArticleImageDescription('标题说明', '备用说明')).toBe('标题说明');
    expect(getArticleImageDescription('', '备用说明')).toBe('备用说明');
  });

  it('does not expose filenames as image descriptions', () => {
    expect(isMeaningfulArticleImageDescription('photos/demo-image.webp?width=1200')).toBe(false);
    expect(getArticleImageDescription('', 'IMG_20260815.JPG')).toBe('');
    expect(getArticleImageDescription('', '')).toBe('');
  });

  it('decodes sanitized attribute entities exactly once', () => {
    expect(decodeArticleImageAttribute('A &amp; B &quot;C&quot; &#x4E2D;&#25991;'))
      .toBe('A & B "C" 中文');
  });

  it('opens only successfully loaded images', () => {
    expect(canOpenArticleImage({ complete: true, naturalWidth: 1200, src: '/image.webp' })).toBe(true);
    expect(canOpenArticleImage({ complete: false, naturalWidth: 0, src: '/image.webp' })).toBe(false);
    expect(canOpenArticleImage({ complete: true, naturalWidth: 0, src: '/broken.webp' })).toBe(false);
  });

  it('renders the description and zoom toolbar inside the enlarged view', () => {
    const page = readFileSync(new URL('../src/pages/post/[id].astro', import.meta.url), 'utf8');

    expect(page).toContain('data-article-image-open');
    expect(page).toContain('data-image-description');
    expect(page).toContain('id="article-image-lightbox"');
    expect(page).toContain('id="article-image-lightbox-toolbar"');
    expect(page).toContain('id="lightbox-zoom-in"');
    expect(page).toContain('id="lightbox-zoom-out"');
    expect(page).toContain('id="lightbox-zoom-toggle"');
    expect(page).toContain('id="lightbox-zoom-reset"');
    expect(page).toContain('id="article-image-lightbox-caption"');
    expect(page).toContain('imageLightbox.showModal()');
    expect(page).toContain('trigger.disabled = true');
    expect(page).toContain('!canOpenArticleImage(sourceImage)');
    expect(page).toContain("target.classList.contains('article-image-lightbox-shell')");
    expect(page).not.toContain('class="article-image-caption"');
  });

  it('visually clamps long captions without truncating their accessible text', () => {
    const styles = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
    expect(styles).toMatch(/\.article-image-lightbox-caption\s*\{[\s\S]*-webkit-line-clamp:\s*3;/);
    expect(styles).toMatch(/\.article-image-lightbox-caption\[hidden\]\s*\{\s*display:\s*none;/);
    expect(styles).toContain('.article-image-lightbox-toolbar');
    expect(styles).toContain('.article-image-lightbox-image.is-zoomed');
  });

  it('clamps zoom scales and cycles zoom levels smoothly', () => {
    expect(clampZoomScale(0.5)).toBe(1);
    expect(clampZoomScale(2.5)).toBe(2.5);
    expect(clampZoomScale(9)).toBe(5);
    expect(clampZoomScale(Number.NaN)).toBe(1);

    expect(getNextZoomScale(1)).toBe(2);
    expect(getNextZoomScale(2)).toBe(3);
    expect(getNextZoomScale(3)).toBe(1);
  });

  it('calculates and clamps pan bounds properly during zoom', () => {
    expect(calculatePanBounds(1, 800, 600, 1000, 800)).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 });

    const bounds = calculatePanBounds(2, 800, 600, 1000, 800, 50);
    expect(bounds.maxX).toBeGreaterThan(0);
    expect(bounds.maxY).toBeGreaterThan(0);
    expect(bounds.minX).toBe(-bounds.maxX);
    expect(bounds.minY).toBe(-bounds.maxY);

    expect(clampPanOffset(9999, -9999, bounds)).toEqual({ x: bounds.maxX, y: bounds.minY });
    expect(clampPanOffset(10, 20, bounds)).toEqual({ x: 10, y: 20 });
  });
});

