import type { BrowserContext } from '@playwright/test';
import packageJson from '../../../package.json';
import {
  generateRequestId,
  generateTimestamp,
  generateRequestSignature,
  getPathWithQuery,
  normalizeRequestBody,
  sortUrlSearchParams,
} from '../../../src/shared/security/request-signature.ts';
import { buildSecureHeaders } from '../../../src/shared/security/request-headers.ts';
import { findXhuntServiceWorker } from './extension';

interface SignedApiOptions {
  context: BrowserContext;
  endpoint: string;
  twitterId: string;
  username: string;
  token?: string;
  language?: string;
  method?: string;
  body?: unknown;
}

export interface XhuntApiResult {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  contentType: string;
  body: unknown;
  text: string;
}

const API_BASE_URL =
  process.env.XHUNT_E2E_API_BASE_URL ||
  (process.env.XHUNT_E2E_API_ENV === 'dev'
    ? 'https://test-kb.xhunt.ai/api'
    : 'https://kb.xhunt.ai/api');

export async function getXcomTwitterIdFromCookies(context: BrowserContext) {
  const cookies = await context.cookies(['https://x.com', 'https://twitter.com']);
  const twid = cookies.find((cookie) => cookie.name === 'twid')?.value || '';
  const decodedTwid = decodeURIComponent(twid);
  const twitterId = decodedTwid.match(/\d+/)?.[0] || '';

  if (!twitterId) {
    throw new Error(
      'Cannot resolve current x.com twitter id from twid cookie. Please confirm the E2E Chrome tab is logged in to x.com.',
    );
  }

  return twitterId;
}

export async function fetchXhuntApiFromExtension({
  context,
  endpoint,
  twitterId,
  username,
  token = '',
  language = 'en',
  method = 'GET',
  body,
}: SignedApiOptions): Promise<XhuntApiResult> {
  const requestId = generateRequestId();
  const timestamp = generateTimestamp().toString();
  const safeMethod = method.toUpperCase();
  const bodyText = normalizeRequestBody(body);
  const url = new URL(endpoint, API_BASE_URL);

  url.searchParams.set('x-language', language);
  sortUrlSearchParams(url);

  const pathWithQuery = getPathWithQuery(url);
  const { signature } = await generateRequestSignature({
    method: safeMethod,
    pathWithQuery,
    timestamp,
    requestId,
    bodyText,
    twitterId,
  });

  const headers = buildSecureHeaders({
    requestId,
    timestamp,
    signature,
    extensionVersion: packageJson.version,
    token,
    username,
    twitterId,
    language,
  });

  const serviceWorker = await findXhuntServiceWorker(context);

  return serviceWorker.evaluate(
    async ({ requestUrl, requestMethod, requestHeaders, requestBody }) => {
      const response = await fetch(requestUrl, {
        method: requestMethod,
        headers: requestHeaders,
        body: requestBody || undefined,
        mode: 'cors',
        credentials: 'omit',
      });
      const text = await response.text();
      const contentType = response.headers.get('content-type') || '';
      let parsedBody: unknown = text;

      try {
        parsedBody = JSON.parse(text);
      } catch {
        parsedBody = text;
      }

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        contentType,
        body: parsedBody,
        text,
      };
    },
    {
      requestUrl: url.href,
      requestMethod: safeMethod,
      requestHeaders: headers,
      requestBody: bodyText,
    },
  );
}
