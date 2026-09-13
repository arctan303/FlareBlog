/**
 * 博客数据类型定义。
 * 与 API 共享的类型从 ../../shared/types.ts 导入，保证前后端一致。
 */
import type { ArticleListItem, CategoryInfo, PaginatedResponse } from '../../shared/types';

export type { ArticleListItem, CategoryInfo, PaginatedResponse };

/** 文章（含正文，仅详情页使用） */
export interface Article {
  id: number;
  title: string;
  content: string;
  html_cache: string | null;
  summary: string | null;
  category: string | null;
  author: string;
  last_editor: string | null;
  status: number;
  is_pinned: number;
  views: number;
  created_at: number;
  updated_at: number | null;
}

/** 评论 */
export interface Comment {
  id: number;
  article_id: number;
  username: string;
  email: string | null;
  content: string;
  status: number;
  created_at: number;
}
