import { test, expect } from '../setup/extensionFixture';
import { searchPath, xcomUrl } from '../fixtures/accounts';
import { xhuntSelectors } from '../fixtures/selectors';
import { openXhuntSettings } from '../setup/pluginActions';
import { setExtensionStorage } from '../setup/seedStorage';
import { expectXcomLoggedIn } from '../setup/xcomAuth';
import { attachEvidence, attachEvidenceScreenshot } from '../setup/evidence';
import { normalizeXhuntState, setSettingChecked } from '../setup/xhuntUi';

test.describe('XHunt settings effects', () => {
  test.afterEach(async ({ context }) => {
    await setExtensionStorage(context, {
      '@settings/showSidebarIcon': true,
      '@settings/showAvatarRank': true,
      '@settings/showAiDetectButton': true,
      '@settings/showTokenAnalysis': true,
      '@settings/showTweetAIAnalysis': true,
      '@settings/showArticleBottomRightArea': true,
    });
  });

  test('core switches actually hide and restore their page surfaces', async ({ page, context }, testInfo) => {
    test.setTimeout(180_000);

    await normalizeXhuntState(context);
    await expectXcomLoggedIn(page);

    await openXhuntSettings(page, context);
    await setSettingChecked(page, 'showSidebarIcon', false);
    await page.locator(xhuntSelectors.panelCloseButton).first().click().catch(() => undefined);
    await page.goto(xcomUrl('/home'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await page.locator(xhuntSelectors.sidebarIcon).first().click({ timeout: 3000 }).catch(() => undefined);
    await expect(page.locator(xhuntSelectors.fixedTwitterPanel)).toHaveCount(0, { timeout: 5000 });
    await setExtensionStorage(context, { '@settings/showSidebarIcon': true });

    await openXhuntSettings(page, context);
    await setSettingChecked(page, 'showAvatarRank', false);
    await page.goto(xcomUrl(searchPath()), { waitUntil: 'domcontentloaded' });
    await expect(page.locator(xhuntSelectors.root).first()).toBeAttached({ timeout: 30_000 });
    await expect(page.locator('main article').first()).toBeVisible({ timeout: 45_000 });
    await expect(page.locator(xhuntSelectors.avatarRankBadge)).toHaveCount(0, { timeout: 30_000 });
    await attachEvidenceScreenshot(page, testInfo, 'settings-effect-avatar-rank-off');

    await setExtensionStorage(context, {
      '@settings/showSidebarIcon': true,
      '@settings/showAvatarRank': true,
      '@settings/showAiDetectButton': true,
      '@settings/showTokenAnalysis': true,
      '@settings/showTweetAIAnalysis': true,
      '@settings/showArticleBottomRightArea': true,
    });

    await attachEvidence(testInfo, [
      { name: '侧边栏图标开关', value: '关闭 showSidebarIcon 后回到首页，点击原侧边栏坑位不会打开 XHunt 面板；随后恢复开启' },
      { name: '头像排名开关', value: '通过设置 UI 关闭 showAvatarRank 后，搜索页 .xhunt-avatar-rank-badge 数量为 0；开启态由 search-avatar-rank.spec.ts 覆盖' },
      { name: '其他开关覆盖', value: 'AI Detect、Token Analysis、主题同步已经有独立 E2E 覆盖；本用例只保留两个稳定真实 surface 强断言' },
      { name: '恢复设置', value: '用例结束前和 afterEach 都会恢复核心开关为 true' },
    ]);
  });
});
