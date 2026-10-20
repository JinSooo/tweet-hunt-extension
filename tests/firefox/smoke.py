#!/usr/bin/env python3
"""Smoke-test a packaged add-on in a disposable Firefox profile (stdlib only).

Set FIREFOX_BINARY and GECKODRIVER_BINARY, then run python3 tests/firefox/smoke.py.
The test uses a minimal DOM fixture on a logged-out X document, and changes only
its own extension storage. It does not validate X's authenticated DOM or APIs.
"""

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import zipfile


REPO = Path(__file__).resolve().parents[2]
DEEP_QUERY = """
function q(selector, root=document) {
  const hit=root.querySelector(selector);
  if(hit) return hit;
  for(const node of root.querySelectorAll('*')) {
    if(node.shadowRoot) { const hit=q(selector,node.shadowRoot); if(hit) return hit; }
  }
  return null;
}
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path, default=REPO / 'build/firefox-artifacts/xhunt_community_firefox_port-0.4.1.zip')
    parser.add_argument('--firefox-binary', default=os.environ.get('FIREFOX_BINARY') or shutil.which('firefox'))
    parser.add_argument('--geckodriver-binary', default=os.environ.get('GECKODRIVER_BINARY') or shutil.which('geckodriver'))
    parser.add_argument('--screenshot', type=Path, default=REPO / 'build/firefox-smoke.png')
    args = parser.parse_args()
    if not args.firefox_binary or not args.geckodriver_binary:
        parser.error('Set FIREFOX_BINARY and GECKODRIVER_BINARY to installed executables.')
    package = args.package.resolve()
    with zipfile.ZipFile(package) as archive:
        manifest = json.loads(archive.read('manifest.json'))
    addon_id = manifest['browser_specific_settings']['gecko']['id']
    with socket.socket() as socket_:
        socket_.bind(('127.0.0.1', 0))
        port = socket_.getsockname()[1]
    base_url = f'http://127.0.0.1:{port}'
    session = None

    def request(method, path, data=None):
        request_ = urllib.request.Request(
            base_url + path,
            data=json.dumps(data).encode() if data is not None else None,
            headers={'Content-Type': 'application/json'}, method=method,
        )
        try:
            with urllib.request.urlopen(request_, timeout=60) as response:
                return json.load(response)['value']
        except urllib.error.HTTPError as error:
            raise RuntimeError(error.read().decode()) from error

    def call(method, path, data=None):
        return request(method, f'/session/{session}{path}', data)

    def execute(script, values=None):
        return call('POST', '/execute/sync', {'script': script, 'args': values or []})

    def api(script, values=None):
        script = 'const done=arguments[arguments.length-1];(async()=>{' + script + '})().then(done,e=>done({smokeError:String(e)}));'
        return call('POST', '/execute/async', {'script': script, 'args': values or []})

    def check(condition, message):
        if not condition:
            raise AssertionError(message)
        print('PASS:', message, flush=True)

    def wait_for(script, message, timeout=15):
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            value = execute(script)
            if value:
                return value
            time.sleep(0.2)
        raise AssertionError(message)

    def query(test_id):
        return DEEP_QUERY + 'return q(' + json.dumps(f'[data-xhunt-testid="{test_id}"]') + ');'

    def click(test_id):
        selector = json.dumps(f'[data-xhunt-testid="{test_id}"]')
        # A mounted settings control can still be clipped by its opening animation.
        node = wait_for(DEEP_QUERY + f"""
const element=q({selector});
if(!element) return null;
const rect=element.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
let hit=document.elementFromPoint(x,y);
while(hit?.shadowRoot) {{
  const next=hit.shadowRoot.elementFromPoint(x,y);
  if(!next||next===hit) break;
  hit=next;
}}
return hit===element||element.contains(hit)?element:null;
""", 'UI control did not become clickable: ' + test_id)
        element_id = node['element-6066-11e4-a52e-4f735466cecf']
        call('POST', f'/element/{element_id}/click', {})

    with tempfile.TemporaryDirectory(prefix='xhunt-firefox-smoke-') as work:
        with open(Path(work) / 'geckodriver.log', 'w+') as log:
            driver = subprocess.Popen([
                args.geckodriver_binary, '--host', '127.0.0.1', '--port', str(port),
                '--allow-system-access', '--profile-root', work, '--log', 'warn',
            ], stdout=log, stderr=subprocess.STDOUT)
            try:
                for _ in range(50):
                    try:
                        request('GET', '/status')
                        break
                    except urllib.error.URLError:
                        if driver.poll() is not None:
                            log.seek(0)
                            raise RuntimeError(log.read())
                        time.sleep(0.1)
                result = request('POST', '/session', {'capabilities': {'alwaysMatch': {
                    'browserName': 'firefox', 'acceptInsecureCerts': True,
                    'moz:firefoxOptions': {
                        'binary': args.firefox_binary, 'args': ['-headless'],
                        'prefs': {'datareporting.policy.dataSubmissionEnabled': False, 'toolkit.telemetry.enabled': False},
                    },
                }}})
                session = result['sessionId']
                print('Firefox:', result['capabilities']['browserVersion'], flush=True)
                print('Package SHA256:', hashlib.sha256(package.read_bytes()).hexdigest(), flush=True)
                call('POST', '/window/rect', {'width': 1440, 'height': 1100})
                check(call('POST', '/moz/addon/install', {'path': str(package), 'temporary': True}) == addon_id, 'packaged add-on installs')
                call('POST', '/moz/context', {'context': 'chrome'})
                extension_url = execute('return WebExtensionPolicy.getByID(arguments[0]).getURL("/");', [addon_id])
                call('POST', '/moz/context', {'context': 'content'})
                image_url = extension_url + manifest['icons']['128']
                # An existing image document provides extension APIs without adding a test page to the package.
                call('POST', '/url', {'url': image_url})
                status = api("return await browser.runtime.sendMessage({type:'GET_REALTIME_STATUS'});")
                check(status.get('success') is True, 'background listener responds: ' + json.dumps(status))
                trust = api("return await browser.runtime.sendMessage({type:'EXECUTE_REQUEST',requestId:'firefox-smoke',url:'https://blocked.invalid/',method:'GET',headers:{}});")
                check(trust.get('error') == 'Request URL is not allowed', 'Firefox sender accepted and disallowed API URL rejected')
                call('POST', '/timeouts', {'pageLoad': 20000, 'script': 30000})
                try:
                    call('POST', '/url', {'url': 'https://x.com/home'})
                except RuntimeError as error:
                    if 'timeout' not in str(error):
                        raise
                check(execute('return location.hostname === "x.com";'), 'logged-out X document loads')
                # Keep the real manifest-matched document and injected scripts, but remove X's login UI.
                execute("document.querySelectorAll('dialog').forEach(n=>n.remove());document.documentElement.removeAttribute('inert');document.body.removeAttribute('inert');document.body.innerHTML='<main style=\"padding:48px;font:16px system-ui\"><h1>XHunt Firefox smoke fixture</h1><p>Isolated DOM. No account or backend API is used.</p><div data-testid=\"primaryColumn\"></div></main>';return true;")
                wait_for(query('main-root'), 'Content script React root not rendered')
                check(True, 'content script React root renders on X-origin fixture')
                wait_for(query('user-domain-setup-modal'), 'Onboarding did not render')
                click('domain-card-web3')
                click('domain-setup-next')
                click('domain-setup-confirm')
                wait_for(DEEP_QUERY + 'return !q(\'[data-xhunt-testid="user-domain-setup-modal"]\');', 'Onboarding did not close')
                check(True, 'onboarding completes through UI')
                content_window = call('GET', '/window')
                probe = call('POST', '/window/new', {'type': 'tab'})['handle']
                call('POST', '/window', {'handle': probe})
                call('POST', '/url', {'url': image_url})
                storage = api("return await browser.storage.local.get(['@xhunt/user-domain-setup-completed','@xhunt/user-domain-preference']);")
                check(json.loads(storage['@xhunt/user-domain-setup-completed']) is True, 'onboarding writes extension storage: ' + json.dumps(storage))
                api("await browser.storage.local.set({'@xhunt/header-controls-guide-dismissed-map':JSON.stringify({settings:true,messages:true,drag:true,panel:true})});return true;")
                opened = api("const tabs=await browser.tabs.query({url:'https://x.com/*'});await browser.tabs.sendMessage(tabs[0].id,{type:'OPEN_SETTINGS'});return true;")
                check(opened is True, 'OPEN_SETTINGS message reaches content script')
                call('POST', '/window', {'handle': content_window})
                wait_for(query('settings-page'), 'OPEN_SETTINGS did not open settings')
                check(True, 'settings page opens')
                wait_for(query('settings-language-zh'), 'Language controls did not finish loading')
                click('settings-language-zh')
                wait_for(DEEP_QUERY + 'return q(\'[data-xhunt-testid="settings-language-zh"]\')?.classList.contains("bg-xhunt-accent");', 'Language change did not reach the rendered UI')
                args.screenshot.parent.mkdir(parents=True, exist_ok=True)
                args.screenshot.write_bytes(base64.b64decode(call('GET', '/screenshot')))
                call('POST', '/refresh', {})
                wait_for(query('main-root'), 'Root missing after refresh')
                wait_for(query('fixed-twitter-panel'), 'Completed onboarding did not restore the feature panel')
                check(not execute(query('user-domain-setup-modal')), 'onboarding stays complete after reload')
                call('POST', '/window', {'handle': probe})
                state = api("return await browser.storage.local.get(['@settings/language1','@xhunt/user-domain-setup-completed']);")
                check(json.loads(state['@settings/language1']) == 'zh', 'settings language persists after reload: ' + json.dumps(state))
                call('POST', '/moz/context', {'context': 'chrome'})
                console = execute("const messages=Services.console.getMessageArray().filter(e=>/JavaScript Error/.test(e.message)&&/moz-extension/.test(e.message));const knownLogo=e=>e.message.includes('Content-Security-Policy:')&&e.message.includes('(img-src)')&&e.message.includes('https://oaewcvliegq6wyvp.public.blob.vercel-storage.com/xhunt_new.jpg');return {errors:messages.filter(e=>!knownLogo(e)).map(e=>e.message.split('\\n')[0]),logoWarnings:messages.filter(knownLogo).length};")
                check(not console['errors'], 'no extension JavaScript errors: ' + json.dumps(console['errors']))
                print('Resource CSP warnings (upstream xhunt_new.jpg only):', console['logoWarnings'], flush=True)
                print('Screenshot:', args.screenshot.resolve(), flush=True)
                print('SMOKE COMPLETE', flush=True)
            except Exception:
                if session:
                    try:
                        call('POST', '/moz/context', {'context': 'chrome'})
                        print('Firefox errors:', execute("return Services.console.getMessageArray().filter(e=>/JavaScript Error/.test(e.message)&&/moz-extension/.test(e.message)).map(e=>e.message.split('\\n')[0]).slice(-8);"), flush=True)
                    except Exception:
                        pass
                raise
            finally:
                if session:
                    try:
                        call('DELETE', '')
                    except Exception:
                        pass
                driver.terminate()
                try:
                    driver.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    driver.kill()
                    driver.wait()


if __name__ == '__main__':
    main()
