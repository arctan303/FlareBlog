/**
 * 前后端共享的 API 响应类型。
 * 前端 Astro 和 Worker 后端从同一源引用，消除命名不一致问题。
 */

/** 文章列表项（不含正文，避免传输大字段） */
export interface ArticleListItem {
  id: number;
  title: string;
  summary: string | null;
  category: string | null;
  author: string;
  is_pinned: number;
  views: number;
  created_at: number;
}

/** 分类统计 */
export interface CategoryInfo {
  name: string;
  count: number;
}

/** API 分页响应 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
