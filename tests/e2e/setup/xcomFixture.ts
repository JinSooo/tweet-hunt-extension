import {
  test as base,
  chromium,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import {
  assertXcomProfileAvailable,
  getCdpEndpoint,
  getLocalHeadlessDefault,
  isCdpAvailable,
  resolveXcomUserDataDir,
  shouldUseCdp,
} from './profile';

async function getReusablePage(context: BrowserContext) {
  const pages = context.pages();
  const existingPage = pages.find((candidate) => {
    const url = candidate.url();
    return !url.startsWith('chrome://') && !url.startsWith('devtools://');
  });

  return existingPage || context.newPage();
}

export const test = base.extend<{
  browserConnection: Browser | null;
  context: BrowserContext;
  page: Page;
  userDataDir: string;
}>({
  userDataDir: async ({}, use) => {
    await use(resolveXcomUserDataDir());
  },

  browserConnection: async ({}, use) => {
    if (!shouldUseCdp()) {
      await use(null);
      return;
    }

    const endpoint = getCdpEndpoint();
    if (!(await isCdpAvailable(endpoint))) {
      throw new Error(
        [
          `Cannot connect to Chrome CDP endpoint: ${endpoint}`,
          '',
          'Fix:',
          '1. Run `pnpm test:e2e:auth` first.',
          '2. Log in to x.com in the opened normal Chrome window.',
          '3. Keep that Chrome window open while running E2E tests.',
          '4. Re-run this command in another terminal.',
        ].join('\n'),
      );
    }

    const browser = await chromium.connectOverCDP(endpoint);
    await use(browser);
    // Do not close the connected normal Chrome. It is owned by the user/auth script.
  },

  context: async ({ browserConnection, userDataDir }, use) => {
    if (browserConnection) {
      const context = browserConnection.contexts()[0];
      if (!context) throw new Error('Connected Chrome has no browser context.');
      await use(context);
      return;
    }

    assertXcomProfileAvailable(userDataDir);
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: process.env.XHUNT_E2E_BROWSER_CHANNEL || 'chrome',
      headless: getLocalHeadlessDefault(),
      viewport: { width: 1440, height: 1000 },
      locale: 'en-US',
      timezoneId: 'Asia/Shanghai',
      colorScheme: 'dark',
    });

    await use(context);
    await context.close();
  },

  page: async ({ context }, use) => {
    const page = await getReusablePage(context);
    await use(page);
  },
});

export { expect };
