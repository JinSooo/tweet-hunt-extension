import fs from 'fs';
import os from 'os';
import path from 'path';

export function resolveXcomUserDataDir() {
  if (process.env.XHUNT_E2E_USER_DATA_DIR) {
    return path.resolve(process.env.XHUNT_E2E_USER_DATA_DIR);
  }

  if (process.env.CI) {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'xhunt-e2e-profile-'));
  }

  return path.resolve('tests/.auth/xcom-reader-profile');
}

export function getCdpEndpoint() {
  if (process.env.XHUNT_E2E_CDP_URL) return process.env.XHUNT_E2E_CDP_URL;

  const port = process.env.XHUNT_E2E_CDP_PORT || '9322';
  return `http://127.0.0.1:${port}`;
}

export function shouldUseCdp() {
  if (process.env.CI) return false;
  if (process.env.XHUNT_E2E_USE_CDP === 'false') return false;
  return true;
}

export async function isCdpAvailable(endpoint = getCdpEndpoint()) {
  try {
    const response = await fetch(`${endpoint}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function assertXcomProfileAvailable(userDataDir: string) {
  fs.mkdirSync(userDataDir, { recursive: true });

  const singletonFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
  const existingLocks = singletonFiles
    .map((file) => path.join(userDataDir, file))
    .filter((file) => fs.existsSync(file));

  if (existingLocks.length === 0) return;

  throw new Error(
    [
      'XHunt E2E x.com profile is currently in use by another Chrome process.',
      '',
      `Profile dir: ${userDataDir}`,
      'Detected Chrome singleton files:',
      ...existingLocks.map((file) => `- ${file}`),
      '',
      'Preferred fix:',
      '1. Run `pnpm test:e2e:auth` and keep that Chrome window open.',
      '2. Run E2E tests in another terminal; tests will connect to that window through CDP.',
      '',
      'Fallback fix:',
      '1. Close every Chrome window that uses this profile.',
      '2. Set XHUNT_E2E_USE_CDP=false if you really want Playwright to launch the profile itself.',
      '',
      'If you are sure the profile is not open, these files may be stale after a crashed Chrome session.',
      'Delete the Singleton* files in that profile dir only when no Chrome window is using it.',
    ].join('\n'),
  );
}

export function getLocalHeadlessDefault() {
  if (process.env.XHUNT_E2E_HEADLESS === 'true') return true;
  if (process.env.XHUNT_E2E_HEADLESS === 'false') return false;
  return !!process.env.CI;
}

export function getNavigationDelayMs() {
  return Number(process.env.XHUNT_E2E_NAV_DELAY_MS || 5000);
}
