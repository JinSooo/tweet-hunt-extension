import type { Page } from '@playwright/test';

export async function getLoggedInProfileHandle(page: Page) {
  const profileHref = await page
    .locator('[data-testid="AppTabBar_Profile_Link"]')
    .first()
    .getAttribute('href');

  const handle = profileHref?.split('/').filter(Boolean)[0] || '';

  if (!handle) {
    throw new Error(
      [
        'Cannot resolve current x.com profile handle from AppTabBar_Profile_Link.',
        `Current URL: ${page.url()}`,
      ].join('\n'),
    );
  }

  return handle;
}
