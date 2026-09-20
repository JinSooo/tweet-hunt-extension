import { test, expect } from '../setup/extensionFixture';
import { xhuntSelectors } from '../fixtures/selectors';
import { openXhuntSettings } from '../setup/pluginActions';
import { getParsedExtensionStorage } from '../setup/seedStorage';
import { attachEvidence, attachEvidenceScreenshot } from '../setup/evidence';
import { waitForXhuntPanelSettled } from '../setup/xcomReady';

async function collectSettingsText(page: any) {
  return page.locator(xhuntSelectors.settingsPage).first().evaluate((element: HTMLElement) =>
    (element.innerText || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 20),
  );
}

test.describe('XHunt language switch', () => {
  test('switches settings page between Chinese and English', async ({ page, context }, testInfo) => {
    test.setTimeout(180_000);

    await openXhuntSettings(page, context);
    const settingsPage = page.locator(xhuntSelectors.settingsPage).first();

    await page.locator(xhuntSelectors.settingsLanguageZh).first().click();
    await expect(settingsPage).toContainText('XHunt 设置', { timeout: 30_000 });
    await expect(settingsPage).toContainText('语言', { timeout: 30_000 });
    await expect(settingsPage).toContainText('显示侧边栏图标', { timeout: 30_000 });
    await waitForXhuntPanelSettled(page);
    let storage = await getParsedExtensionStorage<Record<string, unknown>>(context, [
      '@settings/language1',
    ]);
    expect(storage['@settings/language1']).toBe('zh');
    const zhText = await collectSettingsText(page);
    await testInfo.attach('xhunt-i18n-zh-visible-text', {
      body: JSON.stringify(zhText, null, 2),
      contentType: 'application/json',
    });
    await attachEvidenceScreenshot(page, testInfo, 'i18n-settings-zh');

    await page.locator(xhuntSelectors.settingsLanguageEn).first().click();
    await expect(settingsPage).toContainText('XHunt Settings', { timeout: 30_000 });
    await expect(settingsPage).toContainText('Language', { timeout: 30_000 });
    await expect(settingsPage).toContainText('Show Sidebar Icon', { timeout: 30_000 });
    await waitForXhuntPanelSettled(page);
    storage = await getParsedExtensionStorage<Record<string, unknown>>(context, [
      '@settings/language1',
    ]);
    expect(storage['@settings/language1']).toBe('en');
    const enText = await collectSettingsText(page);
    await testInfo.attach('xhunt-i18n-en-visible-text', {
      body: JSON.stringify(enText, null, 2),
      contentType: 'application/json',
    });
    await attachEvidenceScreenshot(page, testInfo, 'i18n-settings-en');

    await attachEvidence(testInfo, [
      { name: '中文断言', value: '点击中文后，设置页可见文案包含 “XHunt 设置 / 语言 / 显示侧边栏图标”，@settings/language1 = zh' },
      { name: '英文断言', value: '点击 EN 后，设置页可见文案包含 “XHunt Settings / Language / Show Sidebar Icon”，@settings/language1 = en' },
      { name: '可见文本证据', value: '报告附件包含 zh/en 两份 settingsPage.innerText JSON，截图也在真实 x.com 内容加载后截取' },
    ]);
  });
});
