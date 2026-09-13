/**
 * 工具函数
 */

/**
 * 格式化 Unix 时间戳为中文日期
 * @example formatDate(1716700800) → "2025年5月26日"
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}年${month}月${day}日`;
}

/**
 * 计算阅读时间（分钟）
 * 中文按 400 字/分钟，英文按 200 词/分钟
 */
export function estimateReadingTime(text: string): number {
  // 移除 HTML 标签
  const plainText = text.replace(/<[^>]*>/g, '');

  // 统计中文字符
  const chineseChars = (plainText.match(/[\u4e00-\u9fff]/g) || []).length;

  // 统计英文单词
  const englishWords = (plainText.replace(/[\u4e00-\u9fff]/g, '').match(/[a-zA-Z]+/g) || []).length;

  const minutes = Math.ceil(chineseChars / 400 + englishWords / 200);
  return Math.max(1, minutes);
}

/**
 * 解析逗号分隔的分类字符串为数组
 * @example parseCategories("Linux,Docker") → ["Linux", "Docker"]
 */
export function parseCategories(category: string | null): string[] {
  if (!category) return [];
  return category.split(/[,，、|]+/).map(c => c.trim()).filter(Boolean);
}

/**
 * 格式化浏览量数字
 * @example formatViews(12345) → "1.2万"
 */
export function formatViews(views: number): string {
  if (views >= 10000) {
    return (views / 10000).toFixed(1) + '万';
  }
  return views.toString();
}
