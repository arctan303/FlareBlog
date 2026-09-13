/**
 * Lightweight URL-pattern router for Cloudflare Workers.
 * Supports named parameters like /articles/:id.
 */
import type { Env, RouteHandler, RouteParams } from './types';

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];

  /** Register a route with a method and path pattern (e.g. "/api/articles/:id"). */
  private add(method: string, path: string, handler: RouteHandler): void {
    const paramNames: string[] = [];
    // Convert path pattern to regex, extracting named params
    const regexStr = path
      .replace(/:([a-zA-Z_]+)/g, (_match, paramName: string) => {
        paramNames.push(paramName);
        return '([^/]+)';
      })
      // Escape any remaining special regex chars (except our groups)
      .replace(/\//g, '\\/');

    const pattern = new RegExp(`^${regexStr}$`);
    this.routes.push({ method, pattern, paramNames, handler });
  }

  get(path: string, handler: RouteHandler): void {
    this.add('GET', path, handler);
  }

  post(path: string, handler: RouteHandler): void {
    this.add('POST', path, handler);
  }

  put(path: string, handler: RouteHandler): void {
    this.add('PUT', path, handler);
  }

  patch(path: string, handler: RouteHandler): void {
    this.add('PATCH', path, handler);
  }

  delete(path: string, handler: RouteHandler): void {
    this.add('DELETE', path, handler);
  }

  /**
   * Match a request to a registered route.
   * Returns the handler and extracted params, or null if no match.
   */
  match(method: string, pathname: string): { handler: RouteHandler; params: RouteParams } | null {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = pathname.match(route.pattern);
      if (!match) continue;

      const params: RouteParams = {};
      route.paramNames.forEach((name, i) => {
        // 畸形百分号编码（如 /articles/%E0%A4%A/comments）会抛 URIError，
        // 捕获后按原始字面量处理，避免扩散成 500。
        try {
          params[name] = decodeURIComponent(match[i + 1]);
        } catch {
          params[name] = match[i + 1];
        }
      });
      return { handler: route.handler, params };
    }
    return null;
  }

  /** Resolve a request: find matching route, execute handler. */
  async resolve(request: Request, env: Env, executionCtx: ExecutionContext): Promise<Response | null> {
    const url = new URL(request.url);
    const result = this.match(request.method, url.pathname);
    if (!result) return null;

    return result.handler({
      request,
      env,
      executionCtx,
      params: result.params,
    });
  }
}
