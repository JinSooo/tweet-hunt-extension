import { test, expect } from '../setup/extensionFixture';
import { xhuntSelectors } from '../fixtures/selectors';
import { openXhuntPanel } from '../setup/pluginActions';
import { attachEvidence, attachEvidenceScreenshot } from '../setup/evidence';

test.describe('XHunt messages page', () => {
  test('opens messages page from panel header and returns to panel', async ({ page, context }, testInfo) => {
    test.setTimeout(120_000);

    await openXhuntPanel(page, context);
    await page.locator(xhuntSelectors.panelMessagesButton).first().click();
    await expect(
      page.locator(`${xhuntSelectors.messagesPage}, ${xhuntSelectors.fixedTwitterPanel}:has-text("XHunt Messages")`).first(),
    ).toBeAttached({ timeout: 30_000 });
    await attachEvidenceScreenshot(page, testInfo, 'messages-page-open');

    await page.locator(xhuntSelectors.panelSettingsButton).first().click();
    await expect(page.locator(xhuntSelectors.settingsPage).first()).toBeAttached({ timeout: 30_000 });
    await attachEvidenceScreenshot(page, testInfo, 'messages-to-settings');

    await attachEvidence(testInfo, [
      { name: '消息入口', value: `${xhuntSelectors.panelMessagesButton} 点击后 Messages 页面挂载` },
      { name: '导航联动', value: '从 Messages 页点击设置按钮可以切到 Settings 页面' },
    ]);
  });
});
