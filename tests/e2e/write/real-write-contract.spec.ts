import { test, expect } from '../setup/extensionFixture';
import { expectXcomLoggedIn } from '../setup/xcomAuth';
import { getLoggedInProfileHandle } from '../setup/xcomSession';
import { seedCompletedDomainSetup } from '../setup/seedStorage';
import { getDecodedExtensionStorage } from '../setup/seedStorage';
import {
  fetchXhuntApiFromExtension,
  getXcomTwitterIdFromCookies,
} from '../setup/xhuntRealApi';
import { attachEvidence, attachEvidenceScreenshot } from '../setup/evidence';
import { xcomUrl } from '../fixtures/accounts';
import { xhuntSelectors } from '../fixtures/selectors';

const TARGET_HANDLE = process.env.XHUNT_E2E_WRITE_TARGET_HANDLE || 'xhunt_ai';

function getKbBaseUrl() {
  return process.env.XHUNT_E2E_API_BASE_URL ||
    (process.env.XHUNT_E2E_API_ENV === 'dev'
      ? 'https://test-kb.xhunt.ai/api'
      : 'https://kb.xhunt.ai/api');
}

function getXhuntBaseOrigin() {
  try {
    const base = new URL(getKbBaseUrl());
    return base.origin;
  } catch {
    return 'https://kb.xhunt.ai';
  }
}

async function attachJson(testInfo: any, name: string, value: unknown) {
  await testInfo.attach(name, {
    body: JSON.stringify(value, null, 2),
    contentType: 'application/json',
  });
}

function extractReviewCommentPayload(responseBody: any) {
  return responseBody?.data?.currentUserReview ||
    responseBody?.currentUserReview ||
    responseBody?.data?.data?.currentUserReview ||
    null;
}

function extractComments(responseBody: any) {
  const comments = responseBody?.data?.comments ||
    responseBody?.comments ||
    responseBody?.data?.data?.comments ||
    [];
  return Array.isArray(comments) ? comments : [];
}

function extractNote(responseBody: any) {
  return responseBody?.note ?? responseBody?.data?.note ?? responseBody?.data?.data?.note;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function closeXhuntPanelIfOpen(page: any) {
  const panel = page.locator(xhuntSelectors.fixedTwitterPanel).first();
  if (!(await panel.isVisible().catch(() => false))) return;

  await page.locator(xhuntSelectors.sidebarIcon).first().click().catch(() => undefined);
  await expect(panel).not.toBeVisible({ timeout: 5_000 }).catch(() => undefined);
}

async function refreshTargetProfileForVisualEvidence(page: any) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(xcomUrl(`/${TARGET_HANDLE}`), { waitUntil: 'domcontentloaded' });

    const userName = page.locator('main [data-testid="UserName"]').first();
    if (await userName.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await expect(page.locator(xhuntSelectors.root).first()).toBeAttached({
        timeout: 30_000,
      });
      await page
        .locator(xhuntSelectors.nameRightData)
        .first()
        .waitFor({ state: 'attached', timeout: 20_000 })
        .catch(() => undefined);
      await page
        .waitForLoadState('networkidle', { timeout: 8_000 })
        .catch(() => undefined);
      await closeXhuntPanelIfOpen(page);
      await page.waitForTimeout(1_500);
      return;
    }

    const retryButton = page.locator('text=/重试|Retry|Try again/i').first();
    if (await retryButton.isVisible().catch(() => false)) {
      await retryButton.click().catch(() => undefined);
      await page.waitForTimeout(3_000);
    } else {
      await page.waitForTimeout(2_000 * attempt);
    }
  }

  await expect(page.locator('main [data-testid="UserName"]').first()).toBeVisible({
    timeout: 30_000,
  });
}

function hasReviewComment(responseBody: any, commentText: string) {
  const currentUserReview = extractReviewCommentPayload(responseBody);

  return currentUserReview?.comment === commentText;
}

function hasCommentInList(responseBody: any, commentText: string) {
  return extractComments(responseBody).some(
    (comment: any) => comment?.comment === commentText,
  );
}

test.describe('XHunt real write API validation', () => {
  test('creates and deletes real review comment and user note through signed plugin API', async ({ page, context }, testInfo) => {
    test.setTimeout(240_000);

    await seedCompletedDomainSetup(context);
    await expectXcomLoggedIn(page);
    const profileHandle = await getLoggedInProfileHandle(page);
    const currentTwitterId = await getXcomTwitterIdFromCookies(context);
    const storage = await getDecodedExtensionStorage<Record<string, any>>(context, [
      '@xhunt/token',
      '@xhunt/user',
    ]);
    const token = storage['@xhunt/token'];
    const user = storage['@xhunt/user'];

    expect(
      typeof token === 'string' && token.length > 10,
      '需要真实插件登录态。请先运行 pnpm test:e2e:plugin-auth 完成真实 OAuth 登录。',
    ).toBe(true);

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const reviewComment = `XHunt E2E review ${runId}`;
    const noteText = `E2E note ${runId}`.slice(0, 30);
    const baseUrl = getKbBaseUrl();
    const baseOrigin = getXhuntBaseOrigin();

    await refreshTargetProfileForVisualEvidence(page);
    const targetAvatar =
      (await page
        .locator('main [data-testid*="UserAvatar-Container"] img')
        .first()
        .getAttribute('src')
        .catch(() => '')) ||
      'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png';
    const targetDisplayName =
      ((await page
        .locator('main [data-testid="UserName"]')
        .first()
        .textContent()
        .catch(() => '')) || 'XHunt')
        .split('@')[0]
        .trim() || 'XHunt';
    await attachEvidenceScreenshot(page, testInfo, 'review-before-create-profile');

    await testInfo.attach('xhunt-api-validations', {
      body: JSON.stringify([
        {
          name: '创建/更新评论',
          method: 'POST',
          endpoint: '/api/xhunt/reviews',
          baseUrl: baseOrigin,
          target: `@${TARGET_HANDLE}`,
          calledBy: '已安装 XHunt 插件的 service worker，携带真实 token 和 XHunt v2 签名 headers',
          assertions: [
            '提交 E2E 专用评论文本',
            '后续查询 currentUserReview 或 comments 能看到该评论',
          ],
        },
        {
          name: '读取评论',
          method: 'GET',
          endpoint: '/api/xhunt/reviews/{handle} 和 /api/xhunt/reviews/{handle}/comments',
          baseUrl: baseOrigin,
          target: `@${TARGET_HANDLE}`,
          calledBy: '已安装 XHunt 插件的 service worker，携带真实 token 和 XHunt v2 签名 headers',
          assertions: ['能查询到刚创建的 E2E 评论'],
        },
        {
          name: '删除评论',
          method: 'POST',
          endpoint: '/api/xhunt/reviews/delete',
          baseUrl: baseOrigin,
          target: `@${TARGET_HANDLE}`,
          calledBy: '已安装 XHunt 插件的 service worker，携带真实 token 和 XHunt v2 签名 headers',
          assertions: [
            '删除接口返回 2xx',
            '删除后 GET /api/xhunt/reviews/{handle} 的 currentUserReview 不再是该 E2E 评论',
            '同时记录 comments 列表是否已刷新，若后端列表缓存延迟则在报告里保留证据',
          ],
        },
        {
          name: '创建/更新备注',
          method: 'POST',
          endpoint: '/api/xhunt/notes',
          baseUrl: baseOrigin,
          target: `@${TARGET_HANDLE}`,
          calledBy: '已安装 XHunt 插件的 service worker，携带真实 token 和 XHunt v2 签名 headers',
          assertions: ['提交 E2E 专用备注文本', '后续 GET /api/xhunt/notes/{handle} 能读到该备注'],
        },
        {
          name: '读取备注',
          method: 'GET',
          endpoint: '/api/xhunt/notes/{handle}',
          baseUrl: baseOrigin,
          target: `@${TARGET_HANDLE}`,
          calledBy: '已安装 XHunt 插件的 service worker，携带真实 token 和 XHunt v2 签名 headers',
          assertions: ['能查询到刚创建的 E2E 备注'],
        },
        {
          name: '删除备注',
          method: 'POST',
          endpoint: '/api/xhunt/notes（note 为空字符串，当前前端删除语义）',
          baseUrl: baseOrigin,
          target: `@${TARGET_HANDLE}`,
          calledBy: '已安装 XHunt 插件的 service worker，携带真实 token 和 XHunt v2 签名 headers',
          assertions: ['保存空备注后，再次读取不再包含该 E2E 备注文本'],
        },
      ]),
      contentType: 'application/json',
    });

    const reviewPayload = {
      handle: TARGET_HANDLE,
      xLink: `https://x.com/${TARGET_HANDLE}`,
      displayName: targetDisplayName,
      avatar: targetAvatar,
      followers: 0,
      following: 0,
      rating: 5,
      tags: ['E2E'],
      comment: reviewComment,
    };

    const createReviewResponse = await fetchXhuntApiFromExtension({
      context,
      endpoint: '/api/xhunt/reviews',
      method: 'POST',
      body: reviewPayload,
      token,
      twitterId: currentTwitterId,
      username: profileHandle,
      language: 'en',
    });
    await attachJson(testInfo, 'xhunt-review-create-response', createReviewResponse);
    expect(createReviewResponse.ok, `Create review failed: ${createReviewResponse.status} ${createReviewResponse.text}`).toBe(true);

    const getReviewResponse = await fetchXhuntApiFromExtension({
      context,
      endpoint: `/api/xhunt/reviews/${TARGET_HANDLE}?onlyKOL=false&twid=${encodeURIComponent(currentTwitterId)}`,
      token,
      twitterId: currentTwitterId,
      username: profileHandle,
      language: 'en',
    });
    await attachJson(testInfo, 'xhunt-review-get-response', getReviewResponse);
    expect(getReviewResponse.ok, `Get review failed: ${getReviewResponse.status} ${getReviewResponse.text}`).toBe(true);

    const commentsResponse = await fetchXhuntApiFromExtension({
      context,
      endpoint: `/api/xhunt/reviews/${TARGET_HANDLE}/comments?page=1&limit=20&onlyKOL=false`,
      token,
      twitterId: currentTwitterId,
      username: profileHandle,
      language: 'en',
    });
    await attachJson(testInfo, 'xhunt-review-comments-response', commentsResponse);
    expect(commentsResponse.ok, `Get comments failed: ${commentsResponse.status} ${commentsResponse.text}`).toBe(true);

    const currentUserReview = extractReviewCommentPayload(getReviewResponse.body);
    const comments = extractComments(commentsResponse.body);
    const commentFound = currentUserReview?.comment === reviewComment ||
      comments.some((comment: any) => comment?.comment === reviewComment);
    expect(commentFound, '创建评论后，应能在当前用户评价或评论列表中查询到 E2E 评论').toBe(true);

    await refreshTargetProfileForVisualEvidence(page);
    await attachEvidenceScreenshot(page, testInfo, 'review-after-create-profile');

    const deleteReviewResponse = await fetchXhuntApiFromExtension({
      context,
      endpoint: '/api/xhunt/reviews/delete',
      method: 'POST',
      body: { handle: TARGET_HANDLE },
      token,
      twitterId: currentTwitterId,
      username: profileHandle,
      language: 'en',
    });
    await attachJson(testInfo, 'xhunt-review-delete-response', deleteReviewResponse);
    expect(deleteReviewResponse.ok, `Delete review failed: ${deleteReviewResponse.status} ${deleteReviewResponse.text}`).toBe(true);

    let reviewAfterDeleteResponse = await fetchXhuntApiFromExtension({
      context,
      endpoint: `/api/xhunt/reviews/${TARGET_HANDLE}?onlyKOL=false&twid=${encodeURIComponent(currentTwitterId)}`,
      token,
      twitterId: currentTwitterId,
      username: profileHandle,
      language: 'en',
    });

    for (let attempt = 1; attempt <= 5 && hasReviewComment(reviewAfterDeleteResponse.body, reviewComment); attempt++) {
      await sleep(2_000);
      reviewAfterDeleteResponse = await fetchXhuntApiFromExtension({
        context,
        endpoint: `/api/xhunt/reviews/${TARGET_HANDLE}?onlyKOL=false&twid=${encodeURIComponent(currentTwitterId)}`,
        token,
        twitterId: currentTwitterId,
        username: profileHandle,
        language: 'en',
      });
      await attachJson(testInfo, `xhunt-review-after-delete-response-retry-${attempt}`, reviewAfterDeleteResponse);
    }

    await attachJson(testInfo, 'xhunt-review-after-delete-response', reviewAfterDeleteResponse);
    expect(reviewAfterDeleteResponse.ok, `Get review after delete failed: ${reviewAfterDeleteResponse.status} ${reviewAfterDeleteResponse.text}`).toBe(true);
    expect(
      hasReviewComment(reviewAfterDeleteResponse.body, reviewComment),
      '删除评论后，currentUserReview 不应再包含 E2E 评论',
    ).toBe(false);

    let commentsAfterDeleteResponse = await fetchXhuntApiFromExtension({
      context,
      endpoint: `/api/xhunt/reviews/${TARGET_HANDLE}/comments?page=1&limit=20&onlyKOL=false`,
      token,
      twitterId: currentTwitterId,
      username: profileHandle,
      language: 'en',
    });

    for (let attempt = 1; attempt <= 5 && hasCommentInList(commentsAfterDeleteResponse.body, reviewComment); attempt++) {
      await sleep(2_000);
      commentsAfterDeleteResponse = await fetchXhuntApiFromExtension({
        context,
        endpoint: `/api/xhunt/reviews/${TARGET_HANDLE}/comments?page=1&limit=20&onlyKOL=false`,
        token,
        twitterId: currentTwitterId,
        username: profileHandle,
        language: 'en',
      });
      await attachJson(testInfo, `xhunt-review-comments-after-delete-response-retry-${attempt}`, commentsAfterDeleteResponse);
    }

    await attachJson(testInfo, 'xhunt-review-comments-after-delete-response', commentsAfterDeleteResponse);
    expect(commentsAfterDeleteResponse.ok, `Get comments after delete failed: ${commentsAfterDeleteResponse.status} ${commentsAfterDeleteResponse.text}`).toBe(true);
    const commentListStillHasDeletedComment = hasCommentInList(
      commentsAfterDeleteResponse.body,
      reviewComment,
    );

    await refreshTargetProfileForVisualEvidence(page);
    await attachEvidenceScreenshot(page, testInfo, 'review-after-delete-profile');

    await refreshTargetProfileForVisualEvidence(page);
    await attachEvidenceScreenshot(page, testInfo, 'note-before-create-profile');

    const notePayload = {
      handle: TARGET_HANDLE,
      xLink: `https://x.com/${TARGET_HANDLE}`,
      displayName: targetDisplayName,
      avatar: targetAvatar,
      note: noteText,
    };

    const createNoteResponse = await fetchXhuntApiFromExtension({
      context,
      endpoint: '/api/xhunt/notes',
      method: 'POST',
      body: notePayload,
      token,
      twitterId: currentTwitterId,
      username: profileHandle,
      language: 'en',
    });
    await attachJson(testInfo, 'xhunt-note-create-response', createNoteResponse);
    expect(createNoteResponse.ok, `Create note failed: ${createNoteResponse.status} ${createNoteResponse.text}`).toBe(true);

    const getNoteResponse = await fetchXhuntApiFromExtension({
      context,
      endpoint: `/api/xhunt/notes/${TARGET_HANDLE}`,
      token,
      twitterId: currentTwitterId,
      username: profileHandle,
      language: 'en',
    });
    await attachJson(testInfo, 'xhunt-note-get-response', getNoteResponse);
    expect(getNoteResponse.ok, `Get note failed: ${getNoteResponse.status} ${getNoteResponse.text}`).toBe(true);
    expect(extractNote(getNoteResponse.body)).toBe(noteText);

    await refreshTargetProfileForVisualEvidence(page);
    await attachEvidenceScreenshot(page, testInfo, 'note-after-create-profile');

    const deleteNoteResponse = await fetchXhuntApiFromExtension({
      context,
      endpoint: '/api/xhunt/notes',
      method: 'POST',
      body: {
        ...notePayload,
        note: '',
      },
      token,
      twitterId: currentTwitterId,
      username: profileHandle,
      language: 'en',
    });
    await attachJson(testInfo, 'xhunt-note-delete-response', deleteNoteResponse);
    expect(deleteNoteResponse.ok, `Delete note failed: ${deleteNoteResponse.status} ${deleteNoteResponse.text}`).toBe(true);

    const getNoteAfterDeleteResponse = await fetchXhuntApiFromExtension({
      context,
      endpoint: `/api/xhunt/notes/${TARGET_HANDLE}`,
      token,
      twitterId: currentTwitterId,
      username: profileHandle,
      language: 'en',
    });
    await attachJson(testInfo, 'xhunt-note-after-delete-response', getNoteAfterDeleteResponse);
    expect(getNoteAfterDeleteResponse.ok, `Get note after delete failed: ${getNoteAfterDeleteResponse.status} ${getNoteAfterDeleteResponse.text}`).toBe(true);
    expect(extractNote(getNoteAfterDeleteResponse.body) || '').not.toContain(noteText);

    await refreshTargetProfileForVisualEvidence(page);
    await attachEvidenceScreenshot(page, testInfo, 'note-after-delete-profile');

    await attachEvidence(testInfo, [
      { name: '真实 x.com 当前账号', value: `@${profileHandle}` },
      { name: '真实 x.com twid', value: currentTwitterId },
      { name: '真实 XHunt user', value: user?.username ? `@${user.username}` : '已登录但未读取到 username' },
      { name: '测试目标账号', value: `@${TARGET_HANDLE}` },
      { name: '视觉阶段截图', value: '评论前、评论后、删除评论后、备注前、备注后、删除备注后均已重新打开真实目标 profile 并截图' },
      { name: '评论测试文本', value: reviewComment },
      { name: '评论创建', value: `HTTP ${createReviewResponse.status}` },
      { name: '评论查询', value: commentFound ? '已查到刚创建的评论' : '未查到' },
      {
        name: '评论删除',
        value: `HTTP ${deleteReviewResponse.status}，currentUserReview 已不再包含该评论`,
      },
      {
        name: '评论列表删除后状态',
        value: commentListStillHasDeletedComment
          ? 'comments 列表仍能查到该评论，疑似后端列表缓存延迟；已保留接口响应证据'
          : 'comments 列表已不再包含该评论',
      },
      { name: '备注测试文本', value: noteText },
      { name: '备注创建', value: `HTTP ${createNoteResponse.status}` },
      { name: '备注查询', value: `读取值：${extractNote(getNoteResponse.body) || ''}` },
      { name: '备注删除', value: `HTTP ${deleteNoteResponse.status}，删除后不再包含该备注文本` },
    ]);
  });
});
