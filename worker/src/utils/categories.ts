export function parseCategories(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,，、|]+/)
    .map(category => category.trim())
    .filter(Boolean);
}

/** SQL expression that normalizes the legacy comma-separated category column. */
export function categoryMatchSql(column = 'category'): string {
  return `(',' || REPLACE(REPLACE(REPLACE(REPLACE(${column}, '，', ','), '、', ','), '|', ','), ' ', '') || ',') LIKE ('%,' || REPLACE(?, ' ', '') || ',%')`;
}
