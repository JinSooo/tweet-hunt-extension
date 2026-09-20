import { type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { test, expect } from '../setup/extensionFixture';
import { profilePath, xcomUrl } from '../fixtures/accounts';
import { xhuntSelectors } from '../fixtures/selectors';
import { openXhuntPanel, openXhuntSettings } from '../setup/pluginActions';
import { expectXcomLoggedIn } from '../setup/xcomAuth';
import { getLoggedInProfileHandle } from '../setup/xcomSession';
import { getParsedExtensionStorage } from '../setup/seedStorage';
import { attachEvidence, attachEvidenceScreenshot } from '../setup/evidence';
import { waitForXhuntPanelSettled } from '../setup/xcomReady';

type XTheme = 'light' | 'dark';

const xBackgroundLabels: Record<XTheme, string[]> = {
  light: ['浅色', '默认', 'Light', 'Default'],
  dark: ['暗黑', '黑色', 'Dark', 'Lights out'],
};

const xBackgroundStyleHints: Record<XTheme, string[]> = {
  light: ['background-color: rgb(255, 255, 255)', 'background-color: rgba(255, 255, 255'],
  dark: ['background-color: rgb(0, 0, 0)', 'background-color: rgba(0, 0, 0'],
};

function cssAttr(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function collectThemeVisualState(page: Page) {
  const rootState = await page.locator(xhuntSelectors.root).first().evaluate((root: HTMLElement) => {
    const style = getComputedStyle(root);

    return {
      rootDataTheme: root.getAttribute('data-theme') || '',
      rootBackgroundColor: style.backgroundColor,
      rootColor: style.color,
    };
  });
  const panelState = await page.locator(xhuntSelectors.fixedTwitterPanel).first().evaluate((panel: HTMLElement) => {
    const style = getComputedStyle(panel);

    return {
      panelBackgroundColor: style.backgroundColor,
      panelColor: style.color,
    };
  });
  const pageState = await page.evaluate(() => {
    const htmlStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);

    return {
      documentColorScheme: document.documentElement.style.colorScheme || htmlStyle.colorScheme || '',
      bodyBackgroundColor: bodyStyle.backgroundColor,
    };
  });

  return { ...rootState, ...panelState, ...pageState };
}

async function getCheckedXBackgroundLabel(page: Page) {
  await page.goto(xcomUrl('/settings/display'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('input[name="background-picker"]').first()).toBeAttached({
    timeout: 45_000,
  });

  return page.locator('input[name="background-picker"]:checked').first().getAttribute('aria-label');
}

async function findXBackgroundInput(page: Page, theme: XTheme) {
  await expect(page.locator('input[name="background-picker"]').first()).toBeAttached({
    timeout: 45_000,
  });

  for (const label of xBackgroundLabels[theme]) {
    const input = page
      .locator(`input[name="background-picker"][aria-label="${cssAttr(label)}"]`)
      .first();
    if (await input.count()) return input;
  }

  for (const styleHint of xBackgroundStyleHints[theme]) {
    const input = page
      .locator(`div[style*="${cssAttr(styleHint)}"] input[name="background-picker"]`)
      .first();
    if (await input.count()) return input;
  }

  const labels = await page.locator('input[name="background-picker"]').evaluateAll((inputs) =>
    inputs.map((input) => input.getAttribute('aria-label') || ''),
  );

  throw new Error(
    [
      `Cannot find X background picker for ${theme}.`,
      `Known labels: ${xBackgroundLabels[theme].join(' / ')}`,
      `Actual labels: ${labels.join(' / ')}`,
    ].join('\n'),
  );
}

async function clickXBackground(page: Page, theme: XTheme) {
  await closePanelIfOpen(page);
  await page.goto(xcomUrl('/settings/display'), { waitUntil: 'domcontentloaded' });
  await closePanelIfOpen(page);
  const input = await findXBackgroundInput(page, theme);
  const option = input.locator('xpath=..');

  await option.click({ force: true });
  await expect(input).toBeChecked({ timeout: 30_000 });
  await page.waitForFunction(
    (expectedTheme) => {
      const colorScheme = getComputedStyle(document.documentElement).colorScheme;
      const bodyBackground = getComputedStyle(document.body).backgroundColor;

      if (expectedTheme === 'dark') {
        return colorScheme.includes('dark') || bodyBackground === 'rgb(0, 0, 0)';
      }

      return colorScheme.includes('light') || bodyBackground === 'rgb(255, 255, 255)';
    },
    theme,
    { timeout: 30_000 },
  );
}

async function clickXBackgroundByLabel(page: Page, label: string) {
  await closePanelIfOpen(page);
  await page.goto(xcomUrl('/settings/display'), { waitUntil: 'domcontentloaded' });
  const input = page
    .locator(`input[name="background-picker"][aria-label="${cssAttr(label)}"]`)
    .first();

  if (!(await input.count())) return;

  await closePanelIfOpen(page);
  await input.locator('xpath=..').click({ force: true });
  await expect(input).toBeChecked({ timeout: 30_000 });
}

async function expectXhuntTheme(page: Page, context: BrowserContext, theme: XTheme) {
  const root = page.locator(xhuntSelectors.root).first();
  await expect(root).toBeAttached({ timeout: 30_000 });
  await expect(root).toHaveAttribute('data-theme', theme, { timeout: 30_000 });
  await waitForXhuntPanelSettled(page);

  const storage = await getParsedExtensionStorage<Record<string, unknown>>(context, [
    '@xhunt/theme',
  ]);
  expect(storage['@xhunt/theme']).toBe(theme);
}

async function closePanelIfOpen(page: Page) {
  await page.locator(xhuntSelectors.panelCloseButton).first().click().catch(() => undefined);
}

async function captureThemeSurfaces(
  page: Page,
  context: BrowserContext,
  testInfo: TestInfo,
  theme: XTheme,
  profileHandle: string,
) {
  await openXhuntPanel(page, context);
  await expectXhuntTheme(page, context, theme);
  const homeVisualState = await collectThemeVisualState(page);
  await testInfo.attach(`xhunt-theme-${theme}-home-visual-state`, {
    body: JSON.stringify(homeVisualState, null, 2),
    contentType: 'application/json',
  });
  await attachEvidenceScreenshot(page, testInfo, `theme-${theme}-home-panel`);

  await closePanelIfOpen(page);
  await page.goto(xcomUrl(profilePath(profileHandle)), { waitUntil: 'domcontentloaded' });
  await expect(page.locator(xhuntSelectors.root).first()).toBeAttached({
    timeout: 30_000,
  });
  await expect(page.locator(xhuntSelectors.root).first()).toHaveAttribute('data-theme', theme, {
    timeout: 30_000,
  });
  await expect(page.locator('main [data-testid="UserName"]').first()).toBeVisible({
    timeout: 30_000,
  });
  await waitForXhuntPanelSettled(page);
  await attachEvidenceScreenshot(page, testInfo, `theme-${theme}-profile`);

  await openXhuntSettings(page, context);
  await expectXhuntTheme(page, context, theme);
  await expect(page.locator(xhuntSelectors.settingsPage).first()).toBeAttached({
    timeout: 30_000,
  });
  const settingsVisualState = await collectThemeVisualState(page);
  await testInfo.attach(`xhunt-theme-${theme}-settings-visual-state`, {
    body: JSON.stringify(settingsVisualState, null, 2),
    contentType: 'application/json',
  });
  await attachEvidenceScreenshot(page, testInfo, `theme-${theme}-xhunt-settings`);

  return { homeVisualState, settingsVisualState };
}

test.describe('XHunt theme sync', () => {
  test('syncs plugin theme from real x.com display background clicks', async ({ page, context }, testInfo) => {
    test.setTimeout(240_000);

    await expectXcomLoggedIn(page);
    const profileHandle = await getLoggedInProfileHandle(page);
    const initialBackgroundLabel = await getCheckedXBackgroundLabel(page);

    try {
      await clickXBackground(page, 'light');
      await expectXhuntTheme(page, context, 'light');
      const lightStates = await captureThemeSurfaces(page, context, testInfo, 'light', profileHandle);

      await clickXBackground(page, 'dark');
      await expectXhuntTheme(page, context, 'dark');
      const darkStates = await captureThemeSurfaces(page, context, testInfo, 'dark', profileHandle);

      expect(lightStates.homeVisualState.bodyBackgroundColor).not.toBe(
        darkStates.homeVisualState.bodyBackgroundColor,
      );
      expect(lightStates.homeVisualState.rootDataTheme).toBe('light');
      expect(darkStates.homeVisualState.rootDataTheme).toBe('dark');
      expect(lightStates.settingsVisualState.rootDataTheme).toBe('light');
      expect(darkStates.settingsVisualState.rootDataTheme).toBe('dark');

      await attachEvidence(testInfo, [
        { name: '主题切换触发方式', value: '进入 https://x.com/settings/display，真实点击 X 的 background-picker 背景选项，不再 evaluate 硬改 html/body 样式' },
        { name: 'light 主题断言', value: `点击浅色/默认背景后，XHunt root data-theme=light，@xhunt/theme=light，首页 body 背景=${lightStates.homeVisualState.bodyBackgroundColor}` },
        { name: 'dark 主题断言', value: `点击暗黑/Lights out 背景后，XHunt root data-theme=dark，@xhunt/theme=dark，首页 body 背景=${darkStates.homeVisualState.bodyBackgroundColor}` },
        { name: '截图覆盖', value: '每个主题均包含首页面板、个人 profile 页面、XHunt 设置弹框三类截图，用于检查不同位置 UI 是否展示正确' },
        { name: '测试账号原始 X 背景', value: initialBackgroundLabel || '未知' },
      ]);
    } finally {
      if (initialBackgroundLabel) {
        await clickXBackgroundByLabel(page, initialBackgroundLabel).catch(() => undefined);
      }
    }
  });
});
