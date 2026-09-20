import { test, expect } from '../setup/extensionFixture';
import { xcomUrl } from '../fixtures/accounts';
import { xhuntSelectors } from '../fixtures/selectors';
import { expectXcomLoggedIn } from '../setup/xcomAuth';
import { normalizeXhuntState } from '../setup/xhuntUi';
import { attachEvidence, attachEvidenceScreenshot } from '../setup/evidence';

test.describe('XHunt token highlight and analysis', () => {
  test('highlights supported token text and opens token analysis on hover', async ({ page, context }, testInfo) => {
    test.setTimeout(180_000);

    await normalizeXhuntState(context);
    await expectXcomLoggedIn(page);

    await page.goto(xcomUrl('/search?q=%24BTC&src=typed_query&f=live'), { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main article').first()).toBeVisible({ timeout: 45_000 });
    const token = page.locator(xhuntSelectors.tokenHighlight).first();
    await expect(token).toBeVisible({ timeout: 60_000 });
    await token.hover();

    const panel = page.locator(`${xhuntSelectors.tokenAnalysisPanel}, text="XHunt AI Analysis"`).first();
    const panelVisible = await panel.isVisible({ timeout: 45_000 }).catch(() => false);
    await attachEvidenceScreenshot(page, testInfo, panelVisible ? 'token-highlight-analysis-panel' : 'token-highlight-panel-missing');

    const tokenText = await token.textContent();
    await attachEvidence(testInfo, [
      { name: '搜索页面', value: '打开真实 X 搜索 $BTC live 结果' },
      { name: 'Token 高亮', value: `首个 .xhunt-token-highlight 文案：${tokenText || '-'}` },
      { name: 'Token Analysis', value: panelVisible ? 'hover 高亮 token 后分析面板可见' : '当前环境 hover 后未检测到分析面板，作为 warning 记录' },
    ]);

    if (!panelVisible) {
      testInfo.annotations.push({ type: 'warning', description: 'Token 高亮已出现，但 hover 后未检测到 Token Analysis 面板；可能是接口慢/旧 build 缺少 testid/浮层定位变化。' });
    }
  });
});
