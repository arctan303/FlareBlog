import { Router } from '../../router';
import { registerAdminArticleRoutes } from './articles';
import { registerAdminCommentRoutes } from './comments';

/**
 * Register all admin routes on the given router.
 */
export function registerAdminRoutes(router: Router): void {
  registerAdminArticleRoutes(router);
  registerAdminCommentRoutes(router);
}
