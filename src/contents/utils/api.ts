// src/contents/utils/api.ts
// Open-source API transport placeholder.
// The private build contains the real request transport, signing, proxying and
// endpoint allow-listing logic. Those details are intentionally not published.

interface PublicFetchOptions extends RequestInit {
  body?: any;
  tokenRequired?: boolean;
  signal?: AbortSignal;
  responseType?: 'json' | 'stream';
}

export async function secureFetch<T = any>(
  _endpoint: string,
  _options: PublicFetchOptions = {},
): Promise<T | undefined> {
  return undefined;
}

export async function secureFetchInContent<T = any>(
  _endpoint: string,
  _options: PublicFetchOptions = {},
): Promise<T | undefined> {
  return undefined;
}
