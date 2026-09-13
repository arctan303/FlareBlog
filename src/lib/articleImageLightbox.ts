const IMAGE_FILENAME_PATTERN = /(?:^|[\\/])[^\\/?#]+\.(?:png|jpe?g|gif|webp|svg|avif)(?:[?#].*)?$/i;

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

export interface ArticleImageReadiness {
  complete: boolean;
  naturalWidth: number;
  currentSrc?: string | null;
  src?: string | null;
}

export function decodeArticleImageAttribute(value: string): string {
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|(amp|apos|gt|lt|quot));/gi, (entity, decimal, hexadecimal, named) => {
    if (named) return NAMED_HTML_ENTITIES[String(named).toLowerCase()] || entity;
    const codePoint = Number.parseInt(decimal || hexadecimal, hexadecimal ? 16 : 10);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity;
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return entity;
    }
  });
}

export function isMeaningfulArticleImageDescription(value?: string | null): boolean {
  const normalized = value?.trim() || '';
  return Boolean(normalized) && !IMAGE_FILENAME_PATTERN.test(normalized);
}

export function getArticleImageDescription(title?: string | null, alt?: string | null): string {
  if (isMeaningfulArticleImageDescription(title)) return title!.trim();
  if (isMeaningfulArticleImageDescription(alt)) return alt!.trim();
  return '';
}

export function canOpenArticleImage(image: ArticleImageReadiness): boolean {
  return image.complete
    && image.naturalWidth > 0
    && Boolean(image.currentSrc || image.src);
}

export interface LightboxZoomTransform {
  scale: number;
  x: number;
  y: number;
}

export function clampZoomScale(scale: number, minScale = 1, maxScale = 5): number {
  if (!Number.isFinite(scale)) return minScale;
  const clamped = Math.min(maxScale, Math.max(minScale, scale));
  return Number(clamped.toFixed(3));
}

export function calculatePanBounds(
  scale: number,
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding = 60,
): { minX: number; maxX: number; minY: number; maxY: number } {
  if (scale <= 1 || !imageWidth || !imageHeight || !viewportWidth || !viewportHeight) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  const scaledW = imageWidth * scale;
  const scaledH = imageHeight * scale;

  const maxOffsetX = Math.max(0, (scaledW - viewportWidth) / 2 + padding);
  const maxOffsetY = Math.max(0, (scaledH - viewportHeight) / 2 + padding);

  return {
    minX: -maxOffsetX,
    maxX: maxOffsetX,
    minY: -maxOffsetY,
    maxY: maxOffsetY,
  };
}

export function clampPanOffset(
  x: number,
  y: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): { x: number; y: number } {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, y)),
  };
}

export function getNextZoomScale(currentScale: number): number {
  if (currentScale <= 1.05) return 2.0;
  if (currentScale < 2.95) return 3.0;
  return 1.0;
}

