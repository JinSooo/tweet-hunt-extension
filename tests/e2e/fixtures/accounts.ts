export const xcomAccounts = {
  readerHandle: process.env.XHUNT_E2E_PROFILE_HANDLE || '',
  writerHandle: process.env.XHUNT_E2E_WRITER_HANDLE || 'xhunt_e2e_writer',
  targetProfileHandle: process.env.XHUNT_E2E_TARGET_PROFILE_HANDLE || '',
  statusUrl: process.env.XHUNT_E2E_STATUS_URL || '',
  searchKeyword: process.env.XHUNT_E2E_SEARCH_KEYWORD || 'BTC',
};

export function xcomUrl(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `https://x.com${path.startsWith('/') ? path : `/${path}`}`;
}

export function profilePath(handle = xcomAccounts.readerHandle) {
  const normalizedHandle = handle.replace(/^@/, '');
  return normalizedHandle ? `/${normalizedHandle}` : '/{profile}';
}

export function searchPath(keyword = xcomAccounts.searchKeyword) {
  return `/search?q=${encodeURIComponent(keyword)}&src=typed_query`;
}

export function statusPath() {
  return xcomAccounts.statusUrl || profilePath();
}

export function resolveRuntimeXcomPath(
  path: string,
  profileHandle: string,
  targetProfileHandle = xcomAccounts.targetProfileHandle,
) {
  const normalizedProfileHandle = profileHandle.replace(/^@/, '');
  const normalizedTargetProfileHandle = targetProfileHandle.replace(/^@/, '');

  if (path.includes('{targetProfile}') && !normalizedTargetProfileHandle) {
    return null;
  }

  return path
    .replace('{profile}', normalizedProfileHandle)
    .replace('{targetProfile}', normalizedTargetProfileHandle);
}
