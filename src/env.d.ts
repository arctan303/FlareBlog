/// <reference types="astro/client" />

interface TurnstileApi {
  render(container: HTMLElement, options: {
    sitekey: string;
    action?: string;
    callback(token: string): void;
    'error-callback'?(): void;
  }): string | number;
  remove(widgetId: string | number): void;
  reset?(widgetId?: string | number): void;
}

interface Window {
  loadTurnstileScript?: () => Promise<TurnstileApi>;
  turnstile?: TurnstileApi;
  __turnstileScriptPromise?: Promise<TurnstileApi>;
  showSiteToast?: (
    message: string,
    type?: 'info' | 'success' | 'error' | 'warning',
    duration?: number
  ) => void;
}
