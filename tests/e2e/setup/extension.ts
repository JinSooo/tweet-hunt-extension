import type { BrowserContext } from '@playwright/test';

type ServiceWorker = ReturnType<BrowserContext['serviceWorkers']>[number];

type ExtensionManifest = {
  id: string;
  name: string;
  version: string;
};

function isXhuntManifest(manifest: ExtensionManifest) {
  const expectedName = process.env.XHUNT_E2E_EXTENSION_NAME || 'XHunt';
  return manifest.name.toLowerCase().includes(expectedName.toLowerCase());
}

async function readExtensionManifest(serviceWorker: ServiceWorker) {
  try {
    return await serviceWorker.evaluate(() => ({
      id: chrome.runtime.id,
      name: chrome.runtime.getManifest().name,
      version: chrome.runtime.getManifest().version,
    }));
  } catch {
    return undefined;
  }
}

export async function findXhuntServiceWorker(
  context: BrowserContext,
  timeout = 15_000,
) {
  const deadline = Date.now() + timeout;
  const checkedManifests: ExtensionManifest[] = [];

  while (Date.now() < deadline) {
    for (const serviceWorker of context.serviceWorkers()) {
      if (!serviceWorker.url().startsWith('chrome-extension://')) continue;

      const manifest = await readExtensionManifest(serviceWorker);
      if (!manifest) continue;

      checkedManifests.push(manifest);
      if (isXhuntManifest(manifest)) return serviceWorker;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    await context
      .waitForEvent('serviceworker', { timeout: Math.min(1000, remaining) })
      .catch(() => undefined);
  }

  throw new Error(
    [
      'Cannot find XHunt extension service worker in the connected Chrome context.',
      '',
      'This usually means XHunt is not installed/enabled in the Chrome profile used by E2E,',
      'or the extension service worker has not started yet.',
      '',
      'Fix:',
      '1. Open chrome://extensions in the E2E Chrome window.',
      '2. Enable Developer mode.',
      '3. Load unpacked XHunt from build/chrome-mv3-prod or build/chrome-mv3-dev.',
      '4. Refresh https://x.com/home and re-run the smoke test.',
      '',
      `Expected extension name contains: ${process.env.XHUNT_E2E_EXTENSION_NAME || 'XHunt'}`,
      checkedManifests.length
        ? `Checked extension service workers:\n${checkedManifests
            .map((manifest) => `- ${manifest.name} (${manifest.id}) v${manifest.version}`)
            .join('\n')}`
        : 'Checked extension service workers: none',
    ].join('\n'),
  );
}
