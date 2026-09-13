/**
 * 博客全局配置
 */

// 后端 API 基础地址（本地默认指向 127.0.0.1:8787）
// 生产环境可由 Cloudflare Pages 环境变量 PUBLIC_API_BASE 覆盖
// 开发环境可由 .env 环境变量 PUBLIC_API_BASE 覆盖
export const API_BASE = import.meta.env.PUBLIC_API_BASE || 'http://127.0.0.1:8787';

// 由环境配置注入，请在 .env (本地) 或 CF Pages 环境变量 中配置
export const TURNSTILE_SITEKEY = import.meta.env.PUBLIC_TURNSTILE_SITEKEY;

// 仅构建时使用的认证密钥 (不加 PUBLIC_ 前缀，不会泄露给浏览器)
export const BUILD_API_TOKEN = import.meta.env.BUILD_API_TOKEN || '';
