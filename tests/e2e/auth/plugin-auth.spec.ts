import { test, expect } from '../setup/extensionFixture';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';
import { xhuntSelectors } from '../fixtures/selectors';
import { openXhuntPanel } from '../setup/pluginActions';
import {
  getDecodedExtensionStorage,
  seedLoggedOutPluginState,
} from '../setup/seedStorage';
import { getLoggedInProfileHandle } from '../setup/xcomSession';
import { attachEvidence, attachEvidenceScreenshot } from '../setup/evidence';

const OAUTH_AUTHORIZE_BUTTON_NAME =
  /authorize|authorize app|allow app|授权|授權|允许|允許|同意|認証|連携|アプリにアクセスを許可/i;

function maskSensitiveUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('code')) parsed.searchParams.set('code', '[hidden]');
    if (parsed.searchParams.has('state')) parsed.searchParams.set('state', '[hidden]');
    if (parsed.searchParams.has('oauth_token')) {
      parsed.searchParams.set('oauth_token', '[hidden]');
    }
    return parsed.href;
  } catch {
    return url.replace(/(code|state|oauth_token)=([^&]+)/g, '$1=[hidden]');
  }
}

async function waitForAuthPopup(context: BrowserContext, opener: Page) {
  const popup = await Promise.race([
    opener.waitForEvent('popup', { timeout: 30_000 }),
    context.waitForEvent('page', { timeout: 30_000 }),
  ]);
  await popup.waitForLoadState('domcontentloaded').catch(() => undefined);
  return popup;
}

async function completeTwitterOAuthIfNeeded(authPage: Page, testInfo: TestInfo) {
  let sawAuthorizeButton = false;
  let callbackUrl = '';

  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (authPage.isClosed()) break;

    const currentUrl = authPage.url();
    if (currentUrl.includes('/account/xhunt')) {
      callbackUrl = currentUrl;
      break;
    }

    const authorizeButton = authPage.getByRole('button', {
      name: OAUTH_AUTHORIZE_BUTTON_NAME,
    }).first();

    if (await authorizeButton.isVisible().catch(() => false)) {
      sawAuthorizeButton = true;
      await attachEvidenceScreenshot(authPage, testInfo, 'auth-x-oauth-authorize-page');
      await authorizeButton.click();
      await authPage.waitForLoadState('domcontentloaded').catch(() => undefined);
      await authPage.waitForTimeout(1500);
      continue;
    }

    await authPage.waitForTimeout(1000);
  }

  if (!authPage.isClosed() && !callbackUrl) {
    callbackUrl = authPage.url();
  }

  await authPage.waitForEvent('close', { timeout: 30_000 }).catch(() => undefined);

  return {
    sawAuthorizeButton,
    callbackUrl: maskSensitiveUrl(callbackUrl),
    closed: authPage.isClosed(),
  };
}

test.describe('XHunt plugin auth flow', () => {
  test('logs in through real XHunt Twitter OAuth flow', async ({ page, context }, testInfo) => {
    test.setTimeout(240_000);

    await seedLoggedOutPluginState(context);
    await openXhuntPanel(page, context);

    await expect(page.locator(xhuntSelectors.authLoggedOutPanel).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator(xhuntSelectors.authLoginButton).first()).toBeVisible({
      timeout: 30_000,
    });
    await attachEvidenceScreenshot(page, testInfo, 'auth-real-logged-out-before-login');

    const profileHandle = await getLoggedInProfileHandle(page);
    const currentTwitterId = await page.evaluate(() => {
      const twid = document.cookie
        .split('; ')
        .find((row) => row.startsWith('twid='))
        ?.split('=')[1];
      const decodedTwid = twid ? decodeURIComponent(twid) : '';
      return decodedTwid.match(/\d+/)?.[0] || '';
    });

    await testInfo.attach('xhunt-api-validations', {
      body: JSON.stringify([
        {
          name: 'Twitter OAuth 登录 URL',
          method: 'GET',
          endpoint: '/api/xhunt/auth/twitter/url',
          baseUrl: 'https://kb.xhunt.ai',
          target: `@${profileHandle}`,
          calledBy: '插件 Login 按钮触发 secureFetch，经 XHunt background/service worker 请求',
          assertions: [
            '点击 Login 后打开真实 X OAuth 授权页',
            '授权页来自 x.com / twitter.com',
          ],
        },
        {
          name: 'Twitter OAuth Callback 登录',
          method: 'POST',
          endpoint: '/api/xhunt/auth/twitter/callback',
          baseUrl: 'https://kb.xhunt.ai',
          target: `@${profileHandle}`,
          calledBy: 'x.com/account/xhunt callback 页面由插件 content script 调用 postTwitterCallback',
          assertions: [
            'callback 完成后 @xhunt/token 写入插件加密 storage',
            'callback 完成后 @xhunt/user 写入插件加密 storage',
            '插件面板展示真实 x.com 当前账号',
          ],
        },
      ]),
      contentType: 'application/json',
    });

    const authPopupPromise = waitForAuthPopup(context, page);
    await page.locator(xhuntSelectors.authLoginButton).first().click();
    const authPage = await authPopupPromise;
    const openedAuthUrl = maskSensitiveUrl(authPage.url());

    const oauthResult = await completeTwitterOAuthIfNeeded(authPage, testInfo);

    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await openXhuntPanel(page, context);

    const loggedInPanel = page.locator(xhuntSelectors.authLoggedInPanel).first();
    await expect(loggedInPanel).toBeVisible({ timeout: 60_000 });
    await expect(loggedInPanel).toContainText(`@${profileHandle}`, {
      timeout: 30_000,
    });
    await attachEvidenceScreenshot(page, testInfo, 'auth-real-logged-in-after-oauth');

    const storage = await getDecodedExtensionStorage<Record<string, any>>(context, [
      '@xhunt/token',
      '@xhunt/user',
      '@xhunt/current-username',
    ]);
    const user = storage['@xhunt/user'];
    const token = storage['@xhunt/token'];

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);
    expect(user?.username?.toLowerCase()).toBe(profileHandle.toLowerCase());

    await attachEvidence(testInfo, [
      { name: '真实 x.com 当前账号', value: `@${profileHandle}` },
      { name: '真实 x.com twid', value: currentTwitterId || '未读取到' },
      { name: '登录入口状态', value: '清空插件登录态后，未登录面板和 Login 按钮可见' },
      { name: 'OAuth 打开 URL', value: openedAuthUrl },
      { name: '是否看到 X 授权按钮', value: oauthResult.sawAuthorizeButton ? '是' : '否，可能账号已授权自动跳转' },
      { name: 'OAuth callback URL', value: oauthResult.callbackUrl || 'callback 后页面已关闭' },
      { name: 'OAuth 弹窗是否关闭', value: oauthResult.closed ? '是' : '否' },
      { name: '真实 token 写入', value: token ? '是（已隐藏 token 明文）' : '否' },
      { name: '真实 user 写入', value: user ? `@${user.username}` : '否' },
      { name: '面板登录态', value: `${xhuntSelectors.authLoggedInPanel} 可见，并展示 @${profileHandle}` },
    ]);
  });
});
