import {
  test as base,
  chromium,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  assertXcomProfileAvailable,
  getCdpEndpoint,
  getLocalHeadlessDefault,
  isCdpAvailable,
  resolveXcomUserDataDir,
  shouldUseCdp,
} from './profile';
import { findXhuntServiceWorker } from './extension';

function resolveExtensionPath() {
  const candidates = [
    process.env.XHUNT_EXTENSION_PATH,
    path.resolve('build/chrome-mv3-dev'),
    path.resolve('build/chrome-mv3-prod'),
  ].filter(Boolean) as string[];

  const extensionPath = candidates.find((candidate) => fs.existsSync(candidate));

  if (!extensionPath) {
    throw new Error(
      [
        'XHunt extension build not found.',
        'Please build the extension before running E2E tests.',
        'Expected one of:',
        ...candidates.map((candidate) => `- ${candidate}`),
        'Do not let the test fixture run yarn dev / yarn build automatically.',
      ].join('\n'),
    );
  }

  return extensionPath;
}

async function restoreCookiesFromStorageState(context: BrowserContext) {
  const storageStatePath = process.env.XHUNT_E2E_STORAGE_STATE || 'tests/.auth/xcom-reader.json';
  const resolvedPath = path.resolve(storageStatePath);

  if (!fs.existsSync(resolvedPath)) return;

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const state = JSON.parse(raw) as {
    cookies?: Parameters<BrowserContext['addCookies']>[0];
  };

  if (state.cookies?.length) {
    await context.addCookies(state.cookies);
  }
}

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
  extensionId: string;
  extensionPath: string;
  page: Page;
}>({
  extensionPath: async ({}, use) => {
    await use(resolveExtensionPath());
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
          '1. Run `pnpm test:e2e:auth` first. It opens normal Chrome and loads the extension if a build exists.',
          '2. Log in to x.com in that Chrome window.',
          '3. Keep that Chrome window open while running E2E tests.',
          '4. Re-run this command in another terminal.',
        ].join('\n'),
      );
    }

    const browser = await chromium.connectOverCDP(endpoint);
    await use(browser);
    // Do not close the connected normal Chrome. It is owned by the user/auth script.
  },

  context: async ({ browserConnection }, use) => {
    if (browserConnection) {
      const context = browserConnection.contexts()[0];
      if (!context) throw new Error('Connected Chrome has no browser context.');
      await use(context);
      return;
    }

    const extensionPath = resolveExtensionPath();
    const userDataDir = resolveXcomUserDataDir();
    assertXcomProfileAvailable(userDataDir);

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: process.env.XHUNT_E2E_BROWSER_CHANNEL || 'chrome',
      headless: getLocalHeadlessDefault(),
      viewport: { width: 1440, height: 1000 },
      locale: 'en-US',
      timezoneId: 'Asia/Shanghai',
      colorScheme: 'dark',
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    await restoreCookiesFromStorageState(context);

    await use(context);
    await context.close();
  },

  page: async ({ context }, use) => {
    const page = await getReusablePage(context);
    await use(page);
  },

  extensionId: async ({ context }, use) => {
    const background = await findXhuntServiceWorker(context);
    await use(background.url().split('/')[2]);
  },
});

export { expect };
