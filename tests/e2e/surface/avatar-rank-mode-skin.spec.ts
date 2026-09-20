import { type Page } from '@playwright/test';
import { test, expect } from '../setup/extensionFixture';
import { searchPath, xcomUrl } from '../fixtures/accounts';
import { xhuntSelectors } from '../fixtures/selectors';
import { getParsedExtensionStorage, setExtensionStorage } from '../setup/seedStorage';
import { attachEvidence, attachEvidenceScreenshot } from '../setup/evidence';
import { normalizeXhuntState } from '../setup/xhuntUi';

const AVATAR_MODE_KEYS = [
  '@settings/avatarRankMode',
  '@xhunt/avatar_skin',
  '@xhunt/avatar_skin_customized',
];
const MAIN_ARTICLE_SELECTOR = 'main article';
const MAIN_AVATAR_BADGE_SELECTOR = 'main [data-xhunt-testid="avatar-rank-badge"], main .xhunt-avatar-rank-badge';

async function readAvatarRankDomState(page: Page) {
  return page.evaluate(() => ({
    rootMode: document
      .querySelector('[data-xhunt-testid="main-root"]')
      ?.getAttribute('data-xhunt-avatar-rank-mode'),
    htmlMode: document.documentElement.getAttribute('data-xhunt-avatar-rank-mode'),
    htmlSkin: document.documentElement.getAttribute('data-xhunt-avatar-skin'),
    mainArticleCount: document.querySelectorAll('main article').length,
    mainBadgeCount: document.querySelectorAll('main [data-xhunt-testid="avatar-rank-badge"], main .xhunt-avatar-rank-badge').length,
    allBadgeCount: document.querySelectorAll('[data-xhunt-testid="avatar-rank-badge"], .xhunt-avatar-rank-badge').length,
    badgeText: Array.from(
      document.querySelectorAll('main [data-xhunt-testid="avatar-rank-badge"], main .xhunt-avatar-rank-badge'),
    )
      .slice(0, 5)
      .map((element) => element.textContent?.trim() || ''),
  }));
}

async function waitForSearchAvatarRankReady(page: Page, mode: 'web3' | 'ai', skin: string) {
  await expect(page.locator(xhuntSelectors.root).first()).toHaveAttribute('data-xhunt-avatar-rank-mode', mode, { timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('data-xhunt-avatar-skin', skin, { timeout: 30_000 });
  await page.locator(xhuntSelectors.panelCloseButton).first().click().catch(() => undefined);
  await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator(MAIN_ARTICLE_SELECTOR).first(),
    '等待真实搜索结果 main article 加载完成，避免截到搜索页 loading/空白状态',
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.locator(MAIN_AVATAR_BADGE_SELECTOR).first(),
    '等待主搜索结果区域内的头像排名徽标可见，不能用右侧 XHunt 面板徽标代替',
  ).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(1_500);
}

test.describe('XHunt avatar rank mode and skin', () => {
  test('switches Web3/AI avatar rank mode and persists selected skin', async ({ page, context }, testInfo) => {
    test.setTimeout(180_000);

    await normalizeXhuntState(context);
    await setExtensionStorage(context, {
      '@xhunt/user-domain-preference': {
        domains: ['web3', 'ai'],
        primaryDomain: 'web3',
      },
      '@settings/avatarRankMode': 'web3',
      '@settings/showAvatarRank': true,
      '@settings/showPanel': false,
      '@xhunt/avatar_skin': 'skin-1',
      '@xhunt/avatar_skin_customized': true,
    });

    await page.goto(xcomUrl(searchPath()), { waitUntil: 'domcontentloaded' });
    await waitForSearchAvatarRankReady(page, 'web3', 'skin-1');
    await attachEvidenceScreenshot(page, testInfo, 'avatar-rank-before-web3-skin-1');

    const before = {
      storage: await getParsedExtensionStorage<Record<string, unknown>>(context, AVATAR_MODE_KEYS),
      dom: await readAvatarRankDomState(page),
    };

    await setExtensionStorage(context, {
      '@settings/avatarRankMode': 'ai',
      '@xhunt/avatar_skin': 'skin-10',
      '@xhunt/avatar_skin_customized': true,
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForSearchAvatarRankReady(page, 'ai', 'skin-10');
    await attachEvidenceScreenshot(page, testInfo, 'avatar-rank-after-ai-skin-10');

    const afterAi = {
      storage: await getParsedExtensionStorage<Record<string, unknown>>(context, AVATAR_MODE_KEYS),
      dom: await readAvatarRankDomState(page),
    };

    await setExtensionStorage(context, {
      '@settings/avatarRankMode': 'web3',
      '@xhunt/avatar_skin': 'skin-1',
      '@xhunt/avatar_skin_customized': true,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForSearchAvatarRankReady(page, 'web3', 'skin-1');
    await attachEvidenceScreenshot(page, testInfo, 'avatar-rank-restored-web3-skin-1');

    const restored = {
      storage: await getParsedExtensionStorage<Record<string, unknown>>(context, AVATAR_MODE_KEYS),
      dom: await readAvatarRankDomState(page),
    };

    await testInfo.attach('xhunt-avatar-rank-mode-skin-state', {
      body: JSON.stringify({ before, afterAi, restored }, null, 2),
      contentType: 'application/json',
    });

    await setExtensionStorage(context, { '@settings/showPanel': true });

    await attachEvidence(testInfo, [
      { name: '切换前 Web3', value: '设置 @settings/avatarRankMode=web3、@xhunt/avatar_skin=skin-1；等待搜索页 main article 和 main 内头像排名徽标均可见后截图' },
      { name: '切换后 AI', value: '切换 @settings/avatarRankMode=ai、@xhunt/avatar_skin=skin-10；刷新后验证 main-root/html data 属性，并等待 main 搜索结果徽标可见后截图' },
      { name: '恢复 Web3', value: '用例结束前恢复 @settings/avatarRankMode=web3、@xhunt/avatar_skin=skin-1，并再次截图/断言 DOM 已恢复' },
      { name: '对比证据', value: '报告包含 avatar-rank-before-web3-skin-1、avatar-rank-after-ai-skin-10、avatar-rank-restored-web3-skin-1 三张截图和 xhunt-avatar-rank-mode-skin-state JSON' },
    ]);
  });
});
