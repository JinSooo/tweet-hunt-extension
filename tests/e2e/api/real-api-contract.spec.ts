import { test, expect } from '../setup/extensionFixture';
import { profilePath, resolveRuntimeXcomPath, xcomUrl } from '../fixtures/accounts';
import { xhuntSelectors } from '../fixtures/selectors';
import { expectXcomLoggedIn } from '../setup/xcomAuth';
import { getLoggedInProfileHandle } from '../setup/xcomSession';
import { getDecodedExtensionStorage, seedCompletedDomainSetup } from '../setup/seedStorage';
import {
  fetchXhuntApiFromExtension,
  getXcomTwitterIdFromCookies,
} from '../setup/xhuntRealApi';
import { attachEvidence, attachEvidenceScreenshot } from '../setup/evidence';

function apiProfilePath(profileHandle: string) {
  const configuredHandle =
    process.env.XHUNT_E2E_API_PROFILE_HANDLE ||
    process.env.XHUNT_E2E_KOL_PROFILE_HANDLE ||
    process.env.XHUNT_E2E_TARGET_PROFILE_HANDLE ||
    'xhunt_ai';

  return profilePath(configuredHandle);
}

test.describe('XHunt real API validation', () => {
  test('fetches real twitter user data through the installed plugin', async ({ page, context }, testInfo) => {
    test.setTimeout(180_000);

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

    const runtimePath = resolveRuntimeXcomPath(apiProfilePath(profileHandle), profileHandle);
    if (!runtimePath) throw new Error('Cannot resolve API profile path.');

    const targetHandle = runtimePath.replace(/^\//, '').split('/')[0];
    if (!targetHandle) throw new Error(`Cannot resolve target profile handle from ${runtimePath}.`);

    await page.goto(xcomUrl(runtimePath), { waitUntil: 'domcontentloaded' });
    await expect(page.locator(xhuntSelectors.root).first()).toBeAttached({
      timeout: 30_000,
    });
    await attachEvidenceScreenshot(page, testInfo, 'api-target-profile-page');

    const apiEndpoint = `/api/xhunt/proxy/public/fetch/twitter/user?target=k8s_kota&username=${encodeURIComponent(targetHandle)}`;
    await testInfo.attach('xhunt-api-validations', {
      body: JSON.stringify([
        {
          name: 'Twitter 用户数据',
          method: 'GET',
          endpoint: '/api/xhunt/proxy/public/fetch/twitter/user',
          baseUrl:
            process.env.XHUNT_E2E_API_BASE_URL ||
            (process.env.XHUNT_E2E_API_ENV === 'dev'
              ? 'https://test-kb.xhunt.ai/api'
              : 'https://kb.xhunt.ai/api'),
          target: `@${targetHandle}`,
          calledBy: '已安装 XHunt 插件的 service worker，携带 XHunt v2 签名 headers',
          assertions: [
            'HTTP status 为 2xx',
            '响应是 JSON',
            'body.data.data 为非空对象',
            '返回数据包含 twitter_id / twitterId / user_id / id / username / screen_name / basicInfo / basic_info 中至少一个身份字段',
          ],
        },
        {
          name: '当前登录用户',
          method: 'GET',
          endpoint: '/api/xhunt/auth/me',
          baseUrl:
            process.env.XHUNT_E2E_API_BASE_URL ||
            (process.env.XHUNT_E2E_API_ENV === 'dev'
              ? 'https://test-kb.xhunt.ai/api'
              : 'https://kb.xhunt.ai/api'),
          target: `@${profileHandle}`,
          calledBy: '已安装 XHunt 插件的 service worker，携带真实 token、真实 x.com twid 和 XHunt v2 签名 headers',
          assertions: [
            'HTTP status 为 2xx',
            '响应包含当前登录 XHunt 用户信息',
            '返回 username/twitterId 与真实登录态一致',
          ],
        },
      ]),
      contentType: 'application/json',
    });

    const response = await fetchXhuntApiFromExtension({
      context,
      endpoint: apiEndpoint,
      twitterId: currentTwitterId,
      username: profileHandle,
      language: 'en',
    });

    await testInfo.attach('xhunt-twitter-user-api-response', {
      body: JSON.stringify(response, null, 2),
      contentType: 'application/json',
    });

    expect(response.ok, `API status: ${response.status} ${response.statusText} ${response.url}`).toBe(true);

    const body = response.body as any;
    const data = body?.data?.data;
    expect(data, 'Expected body.data.data from fetch/twitter/user API').toBeTruthy();
    expect(typeof data).toBe('object');
    expect(Object.keys(data).length).toBeGreaterThan(0);

    const hasIdentity = Boolean(
      data?.twitter_id ||
        data?.twitterId ||
        data?.user_id ||
        data?.id ||
        data?.username ||
        data?.screen_name ||
        data?.basicInfo ||
        data?.basic_info,
    );
    expect(hasIdentity, 'API response should contain user identity fields').toBe(true);

    expect(
      typeof token === 'string' && token.length > 10,
      '需要真实插件登录态，才能校验 /api/xhunt/auth/me。请先运行 pnpm test:e2e:plugin-auth。',
    ).toBe(true);

    const authMeResponse = await fetchXhuntApiFromExtension({
      context,
      endpoint: `/api/xhunt/auth/me?username=${encodeURIComponent(profileHandle)}&twid=${encodeURIComponent(currentTwitterId)}`,
      token,
      twitterId: currentTwitterId,
      username: profileHandle,
      language: 'en',
    });

    await testInfo.attach('xhunt-auth-me-api-response', {
      body: JSON.stringify(authMeResponse, null, 2),
      contentType: 'application/json',
    });

    expect(authMeResponse.ok, `Auth me API status: ${authMeResponse.status} ${authMeResponse.statusText} ${authMeResponse.url}`).toBe(true);
    const authMeBody = authMeResponse.body as any;
    const authMeUsername = authMeBody?.username || authMeBody?.data?.username || authMeBody?.user?.username;
    const authMeTwitterId = authMeBody?.twitterId || authMeBody?.data?.twitterId || authMeBody?.id || authMeBody?.data?.id;
    expect(String(authMeUsername || user?.username || '').toLowerCase()).toBe(profileHandle.toLowerCase());
    expect(String(authMeTwitterId || user?.twitterId || user?.id || '')).toBe(currentTwitterId);

    await attachEvidence(testInfo, [
      { name: '真实 x.com 当前账号', value: `@${profileHandle}` },
      { name: '真实 x.com twid', value: currentTwitterId },
      { name: 'API 请求 URL', value: response.url },
      { name: 'API HTTP 状态', value: `${response.status} ${response.statusText || ''}`.trim() },
      { name: 'API Content-Type', value: response.contentType || '-' },
      { name: 'API 返回数据字段', value: Object.keys(data).slice(0, 30).join(', ') },
      { name: 'API 测试目标账号', value: `@${targetHandle}` },
      { name: 'Auth/me 请求 URL', value: authMeResponse.url },
      { name: 'Auth/me HTTP 状态', value: `${authMeResponse.status} ${authMeResponse.statusText || ''}`.trim() },
      { name: 'Auth/me 用户校验', value: `username=${authMeUsername || user?.username}，twitterId=${authMeTwitterId || user?.twitterId || user?.id}` },
    ]);
  });
});
