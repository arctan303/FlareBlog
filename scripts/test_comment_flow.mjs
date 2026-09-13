const fetch = globalThis.fetch;

const BLOG_WORKER = process.env.PUBLIC_API_BASE || 'http://127.0.0.1:8787';

async function testCommentSubmission() {
  console.log('💬 开始对【FlareBlog 评论提交与即时可见流程】进行验证...\n');

  try {
    // 1. 测试正常读者评论提交（FlareBlog 默认 status=1 直接入库发布）
    console.log('--- 1. 提交读者评论到文章 1 ---');
    const commentRes = await fetch(`${BLOG_WORKER}/api/public/articles/1/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: '开源体验官',
        email: 'tester@example.com',
        content: 'FlareBlog 基座运行正常，本地 D1 评论直接可见！',
        cf_turnstile_response: 'dummy_passed_token'
      })
    });

    const commentData = await commentRes.json();
    console.log(`[HTTP 状态]: ${commentRes.status}`);
    console.log(`[评论提交结果]:`, commentData);

    if (!commentRes.ok) {
      throw new Error(`评论提交失败: ${JSON.stringify(commentData)}`);
    }

    // 2. 校验公开评论列表中是否已包含刚才提交的评论
    console.log('\n--- 2. 检查公开评论列表 ---');
    const listRes = await fetch(`${BLOG_WORKER}/api/public/articles/1/comments`);
    const listData = await listRes.json();
    console.log(`[公开评论总数]: ${listData.total || (listData.data ? listData.data.length : 0)}`);
    const found = (listData.data || []).some(c => c.username === '开源体验官');
    console.log(`[新评论是否即时可见]: ${found ? '✅ 是' : '❌ 否'}`);

    console.log('\n🎉 FlareBlog 文章评论流程验证完成！');
  } catch (err) {
    console.error('❌ 评论流程验证异常:', err);
  }
}

testCommentSubmission();
