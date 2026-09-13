/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare Workers 环境绑定、DB 行类型、请求/响应类型。
 * 共享的 API 响应类型（ArticleListItem, CategoryInfo, PaginatedResponse）参见 ../../shared/types.ts
 */
import type { ArticleListItem, CategoryInfo, PaginatedResponse } from '../../shared/types';

export type { ArticleListItem, CategoryInfo, PaginatedResponse };

export interface Env {
  DB: D1Database;
  ADMIN_API_KEY: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  CORS_ORIGINS?: string;
  BUILD_API_TOKEN?: string;
  GLOBAL_DAILY_COMMENT_LIMIT?: string;
}

// ---------- Database row types ----------

export interface ArticleRow {
  id: number;
  title: string;
  content: string;
  html_cache: string | null;
  summary: string | null;
  category: string | null;
  author: string;
  last_editor: string | null;
  status: number;       // 0 = draft, 1 = published
  is_pinned: number;    // 0 = normal, 1 = pinned
  views: number;
  created_at: number;   // Unix seconds
  updated_at: number | null;
}

/** 后台文章表格使用的精简行，不返回正文等大字段。 */
export interface AdminArticleListItem {
  id: number;
  title: string;
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

export interface CommentRow {
  id: number;
  article_id: number;
  username: string;
  email: string | null;
  content: string;
  status: number;       // 0 = pending, 1 = approved, 2 = rejected
  created_at: number;
  ip: string | null;
  user_agent: string | null;
}

export interface AdminCommentItem extends CommentRow {
  article_title: string | null;
}

// ---------- API request bodies ----------

export interface CreateArticleBody {
  title: string;
  content: string;
  html_cache?: string;
  summary?: string;
  category?: string;
  author?: string;
  last_editor?: string | null;
  status?: number;
  is_pinned?: number;
  created_at?: number;
}

export interface UpdateArticleBody {
  title?: string;
  content?: string;
  html_cache?: string;
  summary?: string;
  category?: string;
  author?: string;
  last_editor?: string | null;
  status?: number;
  is_pinned?: number;
}

export interface CreateCommentBody {
  username: string;
  email?: string;
  content: string;
}

export interface UpdateCommentBody {
  status: number;
}

export interface BatchUpdateCommentsBody {
  ids: number[];
  status: number;
}

// ---------- Router types ----------

export interface RouteParams {
  [key: string]: string;
}

export interface RouteContext {
  request: Request;
  env: Env;
  executionCtx: ExecutionContext;
  params: RouteParams;
}

export type RouteHandler = (ctx: RouteContext) => Promise<Response> | Response;
