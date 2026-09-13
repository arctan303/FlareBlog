import type { RouteContext, CategoryInfo } from '../types';
import { jsonOk } from '../utils/response';
import { Router } from '../router';
import { withCache } from '../middleware/cache';
import { parseCategories } from '../utils/categories';

export function registerCategoryRoutes(router: Router): void {
  router.get('/api/build/categories', withCache(listCategories, 1800));
}

async function listCategories(ctx: RouteContext): Promise<Response> {
  const rows = await ctx.env.DB
    .prepare("SELECT category FROM articles WHERE status = 1 AND category IS NOT NULL AND category != ''")
    .all<{ category: string }>();
  const counts = new Map<string, number>();

  for (const row of rows.results) {
    for (const category of parseCategories(row.category)) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }

  const result: CategoryInfo[] = Array.from(counts, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return jsonOk(result);
}
