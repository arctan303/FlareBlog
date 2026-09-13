/**
 * 全站频率限制配置 - 集中管理，方便调整
 * 
 * burstLimit:   短时间内最大请求数（硬拦截，不可绕过）
 * burstSeconds: burst 窗口大小（秒）
 * dailyFree:    每日免费额度，超过后需要人机验证（0 = 开发模式，每次都验证）
 * needCaptcha:  是否需要 Turnstile 人机验证（false 则仅做 burst 限流）
 */
export interface RateLimitRule {
  action: string;
  burstLimit: number;
  burstSeconds: number;
  dailyFree: number;
  needCaptcha: boolean;
  resetOnCaptcha: boolean;
}

export const RATE_LIMITS: Record<string, RateLimitRule> = {

  // 评论提交
  comment_post: {
    action: 'comment_post',
    burstLimit: 5,
    burstSeconds: 60,
    dailyFree: 2,       // 单IP每天2次免验证，超出需Turnstile
    needCaptcha: true,
    resetOnCaptcha: false,
  },

  // 浏览量计数（纯 burst 限流，超了静默忽略，不弹验证）
  article_view: {
    action: 'article_view',
    burstLimit: 30,
    burstSeconds: 60,
    dailyFree: 9999999, // 不触发人机验证
    needCaptcha: false,
    resetOnCaptcha: false,
  },
};
