import type { BrowserContext } from '@playwright/test';
import { findXhuntServiceWorker } from './extension';

async function getServiceWorker(context: BrowserContext) {
  return findXhuntServiceWorker(context);
}

export async function setExtensionStorage(
  context: BrowserContext,
  values: Record<string, unknown>,
) {
  const serviceWorker = await getServiceWorker(context);

  await serviceWorker.evaluate(async (storageValues) => {
    const encryptedKeys = new Set([
      '@xhunt/token',
      '@xhunt/user',
      '@xhunt/current-username',
      '@xhunt/initial-state-current-user',
      '@xhunt/initial-state-users',
    ]);
    const keyStorageKey = '@xhunt/enc-key';
    const version = 'v2';

    const b64encode = (data: Uint8Array) => {
      let binary = '';
      for (let i = 0; i < data.length; i += 1) {
        binary += String.fromCharCode(data[i]);
      }
      return btoa(binary);
    };

    const b64decode = (value: string) => {
      const binary = atob(value);
      const output = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        output[i] = binary.charCodeAt(i);
      }
      return output;
    };

    const storageGet = (key: string) =>
      new Promise<any>((resolve, reject) => {
        chrome.storage.local.get([key], (items) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve(items[key]);
        });
      });

    const storageSet = (items: Record<string, unknown>) =>
      new Promise<void>((resolve, reject) => {
        chrome.storage.local.set(items, () => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve();
        });
      });

    const ensureCryptoKey = async () => {
      let rawKey = await storageGet(keyStorageKey);
      if (typeof rawKey === 'string') {
        try {
          rawKey = JSON.parse(rawKey);
        } catch {
          // keep raw string
        }
      }

      if (!rawKey || typeof rawKey !== 'string') {
        rawKey = b64encode(crypto.getRandomValues(new Uint8Array(32)));
        await storageSet({ [keyStorageKey]: JSON.stringify(rawKey) });
      }

      return crypto.subtle.importKey(
        'raw',
        b64decode(String(rawKey)),
        'AES-GCM',
        false,
        ['encrypt'],
      );
    };

    const values = storageValues as Record<string, unknown>;
    const shouldEncrypt = Object.keys(values).some((key) => encryptedKeys.has(key));
    const cryptoKey = shouldEncrypt ? await ensureCryptoKey() : null;

    const serializedValues: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (encryptedKeys.has(key)) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = new TextEncoder().encode(JSON.stringify(value));
        const encrypted = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          cryptoKey!,
          data,
        );
        const encryptedPayload = [
          version,
          b64encode(iv),
          b64encode(new Uint8Array(encrypted)),
        ].join(':');
        serializedValues[key] = JSON.stringify(encryptedPayload);
      } else {
        serializedValues[key] = JSON.stringify(value);
      }
    }

    await storageSet(serializedValues);
  }, values);
}

export async function getExtensionStorage<T = Record<string, unknown>>(
  context: BrowserContext,
  keys?: string[],
) {
  const serviceWorker = await getServiceWorker(context);

  return serviceWorker.evaluate((storageKeys) => {
    return new Promise<T>((resolve, reject) => {
      chrome.storage.local.get(storageKeys || null, (items) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(items as T);
      });
    });
  }, keys);
}

export async function getParsedExtensionStorage<T = Record<string, unknown>>(
  context: BrowserContext,
  keys?: string[],
) {
  const rawItems = await getExtensionStorage<Record<string, unknown>>(context, keys);

  return Object.fromEntries(
    Object.entries(rawItems).map(([key, value]) => {
      if (typeof value !== 'string') return [key, value];

      try {
        return [key, JSON.parse(value)];
      } catch {
        return [key, value];
      }
    }),
  ) as T;
}


export async function getDecodedExtensionStorage<T = Record<string, unknown>>(
  context: BrowserContext,
  keys: string[],
) {
  const serviceWorker = await getServiceWorker(context);

  return serviceWorker.evaluate(async (storageKeys) => {
    const encryptedKeys = new Set([
      '@xhunt/token',
      '@xhunt/user',
      '@xhunt/current-username',
      '@xhunt/initial-state-current-user',
      '@xhunt/initial-state-users',
    ]);
    const keyStorageKey = '@xhunt/enc-key';
    const legacyVersion = 'v1';
    const version = 'v2';

    const b64decode = (value: string) => {
      const binary = atob(value);
      const output = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        output[i] = binary.charCodeAt(i);
      }
      return output;
    };

    const storageGet = (requestedKeys: string[]) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        chrome.storage.local.get(requestedKeys, (items) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve(items);
        });
      });

    const parseStorageValue = (value: unknown) => {
      if (typeof value !== 'string') return value;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    };

    const raw = await storageGet([...(storageKeys as string[]), keyStorageKey]);
    let rawKey = parseStorageValue(raw[keyStorageKey]);

    const legacySecret = new TextEncoder().encode('xhunt-fixed-secret-v1');
    const legacyDigest = await crypto.subtle.digest('SHA-256', legacySecret);
    const legacyCryptoKey = await crypto.subtle.importKey(
      'raw',
      legacyDigest,
      'AES-GCM',
      false,
      ['decrypt'],
    );
    const cryptoKey =
      typeof rawKey === 'string'
        ? await crypto.subtle.importKey(
            'raw',
            b64decode(rawKey),
            'AES-GCM',
            false,
            ['decrypt'],
          )
        : null;

    const decodeEncryptedValue = async (payload: string) => {
      const parts = payload.split(':');
      if (
        parts.length !== 3 ||
        (parts[0] !== version && parts[0] !== legacyVersion)
      ) {
        return undefined;
      }
      const key = parts[0] === legacyVersion ? legacyCryptoKey : cryptoKey;
      if (!key) return undefined;
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b64decode(parts[1]) },
        key,
        b64decode(parts[2]),
      );
      return JSON.parse(new TextDecoder().decode(decrypted));
    };

    const decoded: Record<string, unknown> = {};
    for (const key of storageKeys as string[]) {
      const normalized = parseStorageValue(raw[key]);
      if (
        encryptedKeys.has(key) &&
        typeof normalized === 'string' &&
        (normalized.startsWith(`${version}:`) ||
          normalized.startsWith(`${legacyVersion}:`))
      ) {
        decoded[key] = await decodeEncryptedValue(normalized);
      } else {
        decoded[key] = normalized;
      }
    }

    return decoded as T;
  }, keys);
}

export async function removeExtensionStorage(
  context: BrowserContext,
  keys: string[],
) {
  const serviceWorker = await getServiceWorker(context);

  await serviceWorker.evaluate((storageKeys) => {
    return new Promise<void>((resolve, reject) => {
      chrome.storage.local.remove(storageKeys as string[], () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve();
      });
    });
  }, keys);
}

export async function seedCompletedDomainSetup(context: BrowserContext) {
  await setExtensionStorage(context, {
    '@xhunt/user-domain-setup-completed': true,
    '@xhunt/domain-setup-visible': false,
    '@xhunt/user-domain-preference': {
      domains: ['web3'],
      primaryDomain: 'web3',
    },
    '@settings/avatarRankMode': 'web3',
    '@settings/showPanel': true,
    '@settings/showSidebarIcon': true,
    '@xhunt/panelMinimized': false,
    '@xhunt/header-controls-guide-dismissed-map': {
      settings: true,
      messages: true,
      drag: true,
      panel: true,
    },
  });
}

export async function seedLoggedOutPluginState(context: BrowserContext) {
  await removeExtensionStorage(context, [
    '@xhunt/token',
    '@xhunt/user',
    '@xhunt/current-username',
    '@xhunt/initial-state-current-user',
    '@xhunt/initial-state-users',
  ]);
}

export async function seedFakeLoggedInPluginState(
  context: BrowserContext,
  options: {
    username?: string;
    twitterId?: string;
    displayName?: string;
    token?: string;
  } = {},
) {
  const username = options.username || 'xhunt_e2e_user';
  const twitterId = options.twitterId || '1000000000000000001';
  const user = {
    avatar: '',
    displayName: options.displayName || 'XHunt E2E User',
    username,
    id: twitterId,
    twitterId,
    xPoints: 0,
  };

  await setExtensionStorage(context, {
    '@xhunt/token': options.token || '',
    '@xhunt/user': user,
    '@xhunt/current-username': user.username,
    '@xhunt/initial-state-current-user': {
      id_str: user.twitterId,
      screen_name: user.username,
      name: user.displayName,
      profile_image_url_https: user.avatar,
    },
  });
}
