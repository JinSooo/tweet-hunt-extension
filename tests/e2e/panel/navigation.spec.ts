import { test, expect } from '../setup/extensionFixture';
import { xhuntSelectors } from '../fixtures/selectors';
import { openXhuntPanel } from '../setup/pluginActions';
import { attachEvidence, attachEvidenceScreenshot } from '../setup/evidence';

async function expectPanelOpen(page: any) {
  await expect(page.locator(xhuntSelectors.fixedTwitterPanel).first()).toBeAttached({
    timeout: 30_000,
  });
  await expect(page.locator(xhuntSelectors.panelSettingsButton).first()).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('XHunt panel navigation', () => {
  test('navigates to settings and reopens after close', async ({ page, context }, testInfo) => {
    test.setTimeout(180_000);

    await openXhuntPanel(page, context);
    await expectPanelOpen(page);
    await attachEvidenceScreenshot(page, testInfo, 'panel-navigation-home-open');

    await page.locator(xhuntSelectors.panelSettingsButton).first().click();
    await expect(page.locator(xhuntSelectors.settingsPage).first()).toBeAttached({
      timeout: 30_000,
    });
    await expect(page.locator(xhuntSelectors.panelBackButton).first()).toBeVisible({
      timeout: 30_000,
    });
    await attachEvidenceScreenshot(page, testInfo, 'panel-navigation-settings-page');

    await page.locator(xhuntSelectors.panelBackButton).first().click();
    await expect(page.locator(xhuntSelectors.settingsPage).first()).toHaveCount(0, {
      timeout: 30_000,
    });
    await expectPanelOpen(page);
    await attachEvidenceScreenshot(page, testInfo, 'panel-navigation-back-home');

    await page.locator(xhuntSelectors.panelCloseButton).first().click();
    await expect(page.locator(xhuntSelectors.fixedTwitterPanel).first()).toHaveCount(0, {
      timeout: 30_000,
    });
    await attachEvidenceScreenshot(page, testInfo, 'panel-navigation-closed');

    await page.locator(xhuntSelectors.sidebarIcon).first().click();
    await expectPanelOpen(page);
    await attachEvidenceScreenshot(page, testInfo, 'panel-navigation-reopened');

    await attachEvidence(testInfo, [
      { name: '面板打开', value: '点击 XHunt 侧边栏图标后，固定面板和设置按钮可见' },
      { name: '设置页导航', value: '点击设置按钮进入设置页，返回按钮可见，点击返回后设置页卸载' },
      { name: '关闭与恢复', value: '点击关闭按钮后面板卸载，再次点击侧边栏图标可重新打开' },
      { name: '截图证据', value: '包含打开、设置页、返回主面板、关闭、重新打开五个阶段截图' },
    ]);
  });
});
