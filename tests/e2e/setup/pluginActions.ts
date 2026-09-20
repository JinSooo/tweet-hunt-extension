import { expect, type BrowserContext, type Page } from '@playwright/test';
import { xcomUrl } from '../fixtures/accounts';
import { xhuntSelectors } from '../fixtures/selectors';
import { seedCompletedDomainSetup } from './seedStorage';
import { waitForXHomeTimelineReady, waitForXhuntPanelSettled } from './xcomReady';

export async function openXhuntPanel(page: Page, context: BrowserContext) {
  await seedCompletedDomainSetup(context);

  await page
    .evaluate(() => {
      try {
        sessionStorage.removeItem('@xhunt/navigation/main-panel/history');
      } catch {
        // ignore cross-navigation/session access errors
      }
    })
    .catch(() => undefined);

  await page.goto(xcomUrl('/home'), { waitUntil: 'domcontentloaded' });
  await waitForXHomeTimelineReady(page);
  await expect(page.locator(xhuntSelectors.root).first()).toBeAttached({
    timeout: 30_000,
  });
  await expect(page.locator(xhuntSelectors.sidebarIcon).first()).toBeVisible({
    timeout: 30_000,
  });

  await page.locator(xhuntSelectors.sidebarIcon).first().click();
  await expect(page.locator(xhuntSelectors.fixedTwitterPanel).first()).toBeAttached({
    timeout: 30_000,
  });
  await waitForXhuntPanelSettled(page);
}

export async function openXhuntSettings(page: Page, context: BrowserContext) {
  await seedCompletedDomainSetup(context);

  const existingSettingsButton = page.locator(xhuntSelectors.panelSettingsButton).first();
  if (!(await existingSettingsButton.isVisible({ timeout: 3000 }).catch(() => false))) {
    await openXhuntPanel(page, context);
  }

  const settingsButton = page.locator(xhuntSelectors.panelSettingsButton).first();
  await expect(settingsButton).toBeVisible({ timeout: 30_000 });
  await settingsButton.click();

  const settingsPage = page.locator(xhuntSelectors.settingsPage).first();
  if (!(await settingsPage.isVisible({ timeout: 10_000 }).catch(() => false))) {
    await page
      .evaluate(() => {
        try {
          sessionStorage.setItem(
            '@xhunt/navigation/main-panel/history',
            JSON.stringify(['/home']),
          );
        } catch {
          // ignore cross-navigation/session access errors
        }
      })
      .catch(() => undefined);
    await page.locator(xhuntSelectors.panelCloseButton).first().click().catch(() => undefined);
    await openXhuntPanel(page, context);
    await page.locator(xhuntSelectors.panelSettingsButton).first().click();
  }

  await expect(settingsPage).toBeAttached({ timeout: 30_000 });
  await waitForXhuntPanelSettled(page);
}
