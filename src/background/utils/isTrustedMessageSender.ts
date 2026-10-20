export function isTrustedMessageSender(
  sender: { id?: string; origin?: string; url?: string } | undefined,
  runtime = chrome.runtime,
): boolean {
  if (!runtime.id || !sender || sender.id !== runtime.id) return false;

  const senderUrl = sender.origin || sender.url || '';
  if (!senderUrl) return true;

  try {
    const parsed = new URL(senderUrl);
    // Firefox's extension URL contains a UUID, not runtime.id.
    const extensionUrl = new URL(runtime.getURL('/'));
    return (
      (parsed.protocol === extensionUrl.protocol &&
        parsed.host === extensionUrl.host) ||
      (parsed.protocol === 'https:' &&
        (parsed.hostname === 'x.com' || parsed.hostname === 'twitter.com'))
    );
  } catch {
    return false;
  }
}
