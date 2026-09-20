import { expect, type Page } from '@playwright/test';
import { xcomUrl } from '../fixtures/accounts';

export async function expectXcomLoggedIn(page: Page) {
  await page.goto(xcomUrl('/home'), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');

  const url = page.url();
  expect(
    url.includes('/i/flow/login') || url.includes('/login'),
    `x.com auth state is invalid. Refresh tests/.auth/xcom-reader.json or tests/.auth/xcom-reader-profile. Current URL: ${url}`,
  ).toBe(false);

  await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator('[data-testid="AppTabBar_Profile_Link"]').first(),
    [
      'x.com is still not logged in for the E2E browser session.',
      'Open `pnpm test:e2e:auth`, log in inside that normal Chrome window, keep it open, then run tests in another terminal.',
      `Current URL: ${page.url()}`,
    ].join('\n'),
  ).toBeVisible({ timeout: 30_000 });
}

function isXOwnApiNoise(text: string) {
  return /ApiError:\s*https:\/\/api\.x\.com\//i.test(text);
}

function isXhuntRelatedError(text: string) {
  if (isXOwnApiNoise(text)) return false;
  return /xhunt|plasmo|chrome-extension/i.test(text);
}

export async function collectConsoleErrors(page: Page) {
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() !== 'error') return;

    const text = message.text();
    if (isXhuntRelatedError(text)) {
      errors.push(text);
    }
  });

  page.on('pageerror', (error) => {
    const text = error.message || String(error);
    if (isXhuntRelatedError(text)) {
      errors.push(text);
    }
  });

  return errors;
}
