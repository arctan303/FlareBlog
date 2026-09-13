/**
 * API 客户端 - 构建时从 Worker API 获取数据
 */

import type {
  Article,
  ArticleListItem,
  Comment,
  CategoryInfo,
  PaginatedResponse,
} from './types';

import { API_BASE, BUILD_API_TOKEN } from '../config';

/**
 * 通用 fetch 封装，自带针对 429 的指数退避重试机制（专治 SSG 构建时并发过高）
 */
async function fetchApi<T>(path: string, options?: RequestInit, retries = 3, backoff = 1000): Promise<T> {
  const url = `${API_BASE}${path}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (path.startsWith('/api/build/')) {
    if (BUILD_API_TOKEN) {
      headers['x-build-token'] = BUILD_API_TOKEN;
    } else {
      console.warn('[API] BUILD_API_TOKEN is not configured for build-only request!');
    }
  }

  try {
    const res = await fetch(url, {
      ...options,
      signal: options?.signal || AbortSignal.timeout(15_000),
      headers: {
        ...headers,
        ...options?.headers,
      },
    });

    if (!res.ok) {
      if (res.status === 429 && retries > 0) {
        console.warn(`[API] 429 Too Many Requests for ${path}. Retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        return fetchApi<T>(path, options, retries - 1, backoff * 2);
      }
      throw new Error(`API Error: ${res.status} ${res.statusText} - ${url}`);
    }

    return res.json() as Promise<T>;
  } catch (err: any) {
    if (retries > 0 && (
      err?.name === 'AbortError' ||
      err?.name === 'TimeoutError' ||
      err?.message?.includes('fetch') ||
      err?.message?.includes('network')
    )) {
      console.warn(`[API] Network error for ${path}: ${err.message}. Retrying in ${backoff}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchApi<T>(path, options, retries - 1, backoff * 2);
    }
    throw err;
  }
}

interface BuildSiteData {
  articles: Article[];
  comments: Comment[];
}

let buildSiteDataPromise: Promise<BuildSiteData> | null = null;

async function getLegacyBuildSiteData(): Promise<BuildSiteData> {
  const firstPage = await fetchApi<PaginatedResponse<ArticleListItem>>(
    '/api/build/articles?page=1&limit=100'
  );
  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, firstPage.totalPages - 1) }, (_, index) =>
      fetchApi<PaginatedResponse<ArticleListItem>>(
        `/api/build/articles?page=${index + 2}&limit=100`
      )
    )
  );
  const list = [firstPage, ...remainingPages].flatMap(page => page.data);
  const articles: Article[] = [];
  const comments: Comment[] = [];

  // Keep fallback concurrency bounded so older WAF rules are not flooded.
  for (let offset = 0; offset < list.length; offset += 5) {
    const batch = await Promise.all(list.slice(offset, offset + 5).map(async item => {
      const [article, commentPage] = await Promise.all([
        fetchApi<Article>(`/api/build/articles/${item.id}`),
        fetchApi<PaginatedResponse<Comment>>(
          `/api/build/articles/${item.id}/comments?limit=100`
        ).catch(() => null),
      ]);
      return { article, comments: commentPage?.data || [] };
    }));
    for (const item of batch) {
      articles.push(item.article);
      comments.push(...item.comments);
    }
  }

  return { articles, comments };
}

function getBuildSiteData(): Promise<BuildSiteData> {
  if (!buildSiteDataPromise) {
    buildSiteDataPromise = fetchApi<BuildSiteData>('/api/build/site-data')
      .catch(error => {
        console.warn('[API] Build snapshot unavailable; using legacy paginated endpoints.', error);
        return getLegacyBuildSiteData();
      })
      .catch(error => {
        buildSiteDataPromise = null;
        throw error;
      });
  }
  return buildSiteDataPromise;
}

// ============================================================
// 文章相关
// ============================================================

/**
 * 获取所有已发布文章（构建时一次性拉取）
 */
export async function getAllArticles(params?: { exclude_category?: string }): Promise<ArticleListItem[]> {
  const { articles } = await getBuildSiteData();
  const excluded = params?.exclude_category;
  return articles.filter(article => {
    if (!excluded) return true;
    return !article.category
      ?.split(/[,\uff0c\u3001|]+/)
      .map(category => category.trim())
      .includes(excluded);
  });
}

/**
 * 获取单篇文章详情（构建时使用）
 */
export async function getArticle(id: number): Promise<Article> {
  const { articles } = await getBuildSiteData();
  const article = articles.find(item => item.id === id);
  if (!article) {
    throw new Error(`Article ${id} not found`);
  }
  return article;
}

// ============================================================
// 分类相关
// ============================================================

/**
 * 获取分类列表及文章数（构建时使用）
 */
export async function getCategories(): Promise<CategoryInfo[]> {
  try {
    const { articles } = await getBuildSiteData();
    const counts = new Map<string, number>();
    for (const article of articles) {
      const categories = article.category
        ?.split(/[,\uff0c\u3001|]+/)
        .map(category => category.trim())
        .filter(Boolean) || [];
      for (const category of categories) {
        counts.set(category, (counts.get(category) || 0) + 1);
      }
    }
    return Array.from(counts, ([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

// ============================================================
// 评论相关
// ============================================================

/**
 * 获取文章的所有审核通过的评论（构建时使用，SSG预渲染）
 */
export async function getArticleComments(articleId: number): Promise<PaginatedResponse<Comment>> {
  try {
    const { comments } = await getBuildSiteData();
    const data = comments.filter(comment => comment.article_id === articleId);
    return { data, total: data.length, page: 1, limit: data.length || 100, totalPages: 1 };
  } catch {
    return { data: [], total: 0, page: 1, limit: 100, totalPages: 0 };
  }
}
