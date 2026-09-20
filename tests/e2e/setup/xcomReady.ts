import { expect, type Page } from '@playwright/test';

export async function waitForXHomeTimelineReady(page: Page) {
  await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
  await expect(
    page
      .locator([
        'main article',
        'main [data-testid="cellInnerDiv"]',
        'main [data-testid="tweetText"]',
      ].join(', '))
      .first(),
    '等待真实 x.com 首页/时间线内容加载，避免报告截图只截到骨架屏或 loading 状态',
  ).toBeVisible({ timeout: 45_000 });

  await page
    .waitForLoadState('networkidle', { timeout: 8_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1_000);
}

export async function waitForXhuntPanelSettled(page: Page) {
  await page
    .waitForLoadState('networkidle', { timeout: 8_000 })
    .catch(() => undefined);
  await page.waitForTimeout(800);
}
