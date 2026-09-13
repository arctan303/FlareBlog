// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import icon from 'astro-icon';
import sitemap from '@astrojs/sitemap';
import { config } from 'dotenv';
config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
config({ path: '.env' });

// 在构建时拉取文章列表，用于填充 sitemap 的 lastmod
/** @type {Record<string, string>} */
let articleLastMods = {};
if (process.argv.includes('build')) {
  try {
    const API_BASE = process.env.PUBLIC_API_BASE || 'http://127.0.0.1:8787';
    const res = await fetch(`${API_BASE}/api/build/articles?limit=9999`, {
      headers: { 'x-build-token': process.env.BUILD_API_TOKEN || '' }
    });
    if (res.ok) {
      /** @type {{ data?: Array<{ id: number, updated_at?: number | string | null, created_at?: number | string | null }> } | Array<{ id: number, updated_at?: number | string | null, created_at?: number | string | null }>} */
      const data = await res.json();
      const articles = Array.isArray(data) ? data : (data.data || []);
      articles.forEach(article => {
        let dateVal = article.updated_at || article.created_at;
        if (dateVal) {
          // 如果是秒级时间戳 (小于 10000000000)，则乘以 1000 转换为毫秒
          if (typeof dateVal === 'number' && dateVal < 10000000000) {
            dateVal = dateVal * 1000;
          }
          articleLastMods[`/post/${article.id}/`] = new Date(dateVal).toISOString();
        }
      });
      console.log(`[Sitemap] Fetched ${articles.length} articles for lastmod matching.`);
    }
  } catch (e) {
    console.warn('[Sitemap] Failed to fetch articles for lastmod', e);
  }
}

// https://astro.build/config
export default defineConfig({
  // site 用于生成 sitemap.xml、canonical URL 以及 RSS 订阅源的基础域名
  // 部署时改成你自己的域名（也可以配合环境变量注入）。
  site: 'https://your-domain.example',
  prefetch: true,
  integrations: [
    icon(), 
    sitemap({
      filter: (page) => {
        // 从 sitemap 中移除 search 页
        if (page.includes('/search/')) {
          return false;
        }
        return true;
      },
      serialize(item) {
        // 给文章页增加真实的更新时间
        const urlObj = new URL(item.url);
        const path = urlObj.pathname;
        if (articleLastMods[path]) {
          item.lastmod = articleLastMods[path];
        }
        return item;
      }
    })
  ],

  vite: {
    plugins: [tailwindcss()],
    build: {
      assetsInlineLimit: 0,
      rollupOptions: {
        external: ['/pagefind/pagefind.js']
      }
    },
    server: {
      watch: {
        ignored: ['**/.wrangler/**', '**/worker/.wrangler/**']
      }
    }
  },
});
