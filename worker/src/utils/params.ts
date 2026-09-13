/**
 * 查询参数解析辅助：把 URL 查询参数安全解析为正整数，非法值回退默认值。
 * 避免 parseInt 对非数字输入返回 NaN 后经 Math.max 传播到 SQL bind 造成 500。
 */

/** 解析正整数，非法时回退 fallback（默认 1），上限 max 非空时钳制。 */
export function parsePositiveInt(
  raw: string | null,
  fallback = 1,
  max?: number,
): number {
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  // NaN（非数字输入）回退默认值，避免原 Math.max(1, NaN) 传播成 500。
  if (!Number.isFinite(parsed)) return fallback;
  // 0/负数按原 Math.max(1, ...) 语义钳制到 1。
  const clamped = Math.max(1, parsed);
  return max !== undefined ? Math.min(clamped, max) : clamped;
}
