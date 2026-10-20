const DEFAULT_EXTENSION_UPDATE_URL =
  'https://chromewebstore.google.com/detail/xhunt-%E2%80%93-your-ai-co-pilot/gonmfafjcdkngkbhcpmcphlgfhabkeji';
const FIREFOX_EXTENSION_UPDATE_URL =
  'https://github.com/JinSooo/tweet-hunt-extension/releases';

export interface ExtensionUpdateRequiredInfo {
  updateUrl: string;
  message?: string;
  minVersion?: string;
}

type UnknownRecord = Record<string, any>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object';

const pickString = (...values: unknown[]) =>
  values.find((value): value is string => typeof value === 'string' && value.trim().length > 0);

const pickLocalizedMessage = (value: unknown, lang?: string) => {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return undefined;
  return lang === 'zh'
    ? pickString(value.zh, value.en)
    : pickString(value.en, value.zh);
};

const normalizeUpdateInfo = (
  data: UnknownRecord,
  lang?: string
): ExtensionUpdateRequiredInfo | null => {
  const code = pickString(data.code, data.error, data.type, data.reason);
  const updateRequired =
    data.force_update === true ||
    data.forceUpdate === true ||
    data.upgrade_required === true ||
    data.upgradeRequired === true ||
    data.extension_update_required === true ||
    data.extensionUpdateRequired === true ||
    code === 'EXTENSION_UPDATE_REQUIRED' ||
    code === 'extension_update_required';

  if (!updateRequired) return null;

  const isFirefox =
    typeof chrome !== 'undefined' &&
    chrome.runtime?.getURL('/').startsWith('moz-extension://');
  const updateUrl = isFirefox
    ? FIREFOX_EXTENSION_UPDATE_URL
    : pickString(
      data.update_url,
      data.updateUrl,
      data.upgrade_url,
      data.upgradeUrl,
      data.chrome_webstore_url,
      data.chromeWebstoreUrl,
      data.url
    ) || DEFAULT_EXTENSION_UPDATE_URL;

  return {
    updateUrl,
    minVersion: pickString(data.min_version, data.minVersion),
    message: pickLocalizedMessage(data.message, lang),
  };
};

export const getExtensionUpdateRequiredInfo = (
  value: unknown,
  lang?: string
): ExtensionUpdateRequiredInfo | null => {
  if (!value) return null;

  if (isRecord(value)) {
    const direct = normalizeUpdateInfo(value, lang);
    if (direct) return direct;

    const errorDetails = value.errorDetails;
    if (isRecord(errorDetails)) {
      const nested = normalizeUpdateInfo(errorDetails, lang);
      if (nested) return nested;
    }

    const originalResponse = value.originalResponse;
    if (isRecord(originalResponse)) {
      const responseData = originalResponse.data;
      if (isRecord(responseData)) {
        const nested = normalizeUpdateInfo(responseData, lang);
        if (nested) return nested;
      }
      const responseError = originalResponse.error;
      if (isRecord(responseError)) {
        const nested = normalizeUpdateInfo(responseError, lang);
        if (nested) return nested;
      }
    }
  }

  return null;
};
