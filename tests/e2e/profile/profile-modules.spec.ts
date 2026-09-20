import { type Page } from '@playwright/test';
import { test, expect } from '../setup/extensionFixture';
import { profilePath, xcomUrl } from '../fixtures/accounts';
import { xhuntSelectors } from '../fixtures/selectors';
import { expectXcomLoggedIn } from '../setup/xcomAuth';
import { normalizeXhuntState } from '../setup/xhuntUi';
import { attachEvidence, attachEvidenceScreenshot } from '../setup/evidence';

const PROFILE_HANDLE = process.env.XHUNT_E2E_PROFILE_MODULE_HANDLE || process.env.XHUNT_E2E_TARGET_PROFILE_HANDLE || 'DeFiTeddy2020';

function profileInsightsExpandButton(page: Page) {
  return page
    .locator(
      [
        xhuntSelectors.profileInsightsExpandButton,
        'main button[aria-expanded="false"]:has-text("More")',
        'main button[aria-expanded="false"]:has-text("更多")',
        'main button:has-text("More")',
        'main button:has-text("更多")',
      ].join(', '),
    )
    .first();
}

function profileInsightsCollapseButton(page: Page) {
  return page
    .locator(
      [
        xhuntSelectors.profileInsightsCollapseButton,
        'main button[aria-expanded="true"]:has-text("Collapse")',
        'main button[aria-expanded="true"]:has-text("收起")',
        'main button:has-text("Collapse")',
        'main button:has-text("收起")',
      ].join(', '),
    )
    .first();
}

test.describe('XHunt profile core modules', () => {
  test('renders profile data modules and toggles collapsed insights when available', async ({ page, context }, testInfo) => {
    test.setTimeout(180_000);

    await normalizeXhuntState(context);
    await expectXcomLoggedIn(page);
    await page.goto(xcomUrl(profilePath(PROFILE_HANDLE)), { waitUntil: 'domcontentloaded' });
    await page.locator(xhuntSelectors.panelCloseButton).first().click().catch(() => undefined);

    await expect(page.locator(xhuntSelectors.root).first()).toBeAttached({ timeout: 30_000 });
    await expect(page.locator('main [data-testid="UserName"]').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('main')).toContainText(/Global KOL Followers|Global Influence Rank|CN KOLs|Soul Index|Submit Review|Note|More|🏆|关注者/i, { timeout: 45_000 });
    const expandButton = profileInsightsExpandButton(page);
    await expect(
      expandButton,
      `@${PROFILE_HANDLE} Profile 页应该出现 XHunt insights 展开按钮，用于验证折叠/展开交互`,
    ).toBeVisible({ timeout: 60_000 });
    await expect(expandButton).toHaveAttribute('aria-expanded', 'false', { timeout: 30_000 });
    await attachEvidenceScreenshot(page, testInfo, 'profile-modules-before-expand');

    await expandButton.click();
    const collapseButton = profileInsightsCollapseButton(page);
    await expect(collapseButton).toBeVisible({ timeout: 30_000 });
    await expect(collapseButton).toHaveAttribute('aria-expanded', 'true', { timeout: 30_000 });
    await expect(page.locator('main')).toContainText(/Global KOL Followers|Global Influence Rank|CN KOLs|Soul Index|Investors|Portfolio|MBTI|能力|灵魂|投资人|关注者/i, { timeout: 30_000 });
    await attachEvidenceScreenshot(page, testInfo, 'profile-modules-after-expand');

    await collapseButton.click();
    await expect(profileInsightsExpandButton(page)).toBeVisible({ timeout: 30_000 });
    await attachEvidenceScreenshot(page, testInfo, 'profile-modules-after-collapse');

    await attachEvidence(testInfo, [
      { name: '目标 Profile', value: `@${PROFILE_HANDLE}` },
      { name: '核心模块', value: 'Profile main 区域包含 XHunt rank/insight/review/note 等核心文案之一' },
      { name: '展开前', value: 'profile insights 展开按钮可见且 aria-expanded=false，已截图 profile-modules-before-expand' },
      { name: '展开后', value: '点击 More/更多 后 Collapse/收起按钮可见且 aria-expanded=true，完整 insight 文案可见，已截图 profile-modules-after-expand' },
      { name: '收起恢复', value: '点击 Collapse/收起 后 More/更多 按钮重新出现，已截图 profile-modules-after-collapse' },
    ]);
  });
});
