import { describe, it, expect, vi } from 'vitest';
import { registerCommentRoutes } from '../worker/src/routes/comments';
import { registerAdminCommentRoutes } from '../worker/src/routes/admin/comments';
import { Router } from '../worker/src/router';

describe('Comment enhancement API tests', () => {
  it('registers admin and public comment routes without throwing', () => {
    const router = new Router();
    expect(() => registerCommentRoutes(router)).not.toThrow();
    expect(() => registerAdminCommentRoutes(router)).not.toThrow();
  });
});
