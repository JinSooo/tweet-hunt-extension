import assert from 'node:assert/strict';
import test from 'node:test';
import { isTrustedMessageSender } from '../../src/background/utils/isTrustedMessageSender.ts';
import { getExtensionUpdateRequiredInfo } from '../../src/utils/extensionUpdateRequired.ts';

test('Chrome and Firefox extension pages use their runtime URL, with the same sender ID', () => {
  for (const [id, base] of [
    ['chrome-id', 'chrome-extension://chrome-id/'],
    ['@xhunt-firefox.jinsooo', 'moz-extension://random-install-uuid/'],
  ]) {
    const runtime = { id, getURL: (path) => base + path.replace(/^\//, '') };
    globalThis.chrome = { runtime };
    for (const url of [base + 'options.html', 'https://x.com/home', 'https://twitter.com/home']) {
      assert.equal(isTrustedMessageSender({ id, url }, runtime), true);
    }
    for (const url of [
      'moz-extension://another-uuid/options.html',
      'chrome-extension://another-id/options.html',
      'https://x.com.evil.example/',
      'http://x.com/home',
      'data:text/plain,test',
      'not a URL',
    ]) {
      assert.equal(isTrustedMessageSender({ id, url }, runtime), false, url);
    }
    assert.equal(isTrustedMessageSender({ id: 'another-extension', url: 'https://x.com/' }, runtime), false);
    assert.equal(isTrustedMessageSender(undefined, runtime), false);
  }
  delete globalThis.chrome;
});

test('Firefox update prompts never send users to the Chrome Web Store', () => {
  globalThis.chrome = { runtime: { getURL: () => 'moz-extension://install-uuid/' } };
  const info = getExtensionUpdateRequiredInfo({
    force_update: true,
    update_url: 'https://chromewebstore.google.com/detail/upstream',
    min_version: '0.5.0',
  });
  assert.equal(info.updateUrl, 'https://github.com/JinSooo/tweet-hunt-extension/releases');
  assert.equal(info.minVersion, '0.5.0');
  globalThis.chrome = { runtime: { getURL: () => 'chrome-extension://id/' } };
  assert.equal(getExtensionUpdateRequiredInfo({ force_update: true }).updateUrl.includes('chromewebstore.google.com'), true);
  delete globalThis.chrome;
});
