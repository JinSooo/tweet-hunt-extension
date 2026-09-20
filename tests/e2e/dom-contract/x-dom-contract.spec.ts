import { test, expect } from '../setup/xcomFixture';
import { xDomContracts, type XDomContract } from '../fixtures/xDomContract';
import { expectXcomLoggedIn } from '../setup/xcomAuth';
import { getNavigationDelayMs } from '../setup/profile';
import { resolveRuntimeXcomPath, xcomUrl } from '../fixtures/accounts';
import { getLoggedInProfileHandle } from '../setup/xcomSession';
import { attachEvidence, attachEvidenceScreenshot } from '../setup/evidence';

function orderedContracts() {
  return [...xDomContracts].sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    if (a.prepare === b.prepare) return 0;
    if (a.prepare === 'compose-modal') return 1;
    if (b.prepare === 'compose-modal') return -1;
    return 0;
  });
}

async function slowDown() {
  const delay = getNavigationDelayMs();
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

async function prepareContract(page: import('@playwright/test').Page, contract: XDomContract) {
  if (contract.prepare !== 'compose-modal') return;

  const composeSelectors = [
    '[data-testid="SideNav_NewTweet_Button"]',
    'a[href="/compose/post"]',
    'a[href="/compose/tweet"]',
  ];

  for (const selector of composeSelectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      await page.waitForTimeout(1500);
      return;
    }
  }

  await page.goto(xcomUrl('/compose/post'), { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.waitForTimeout(1500);
}

test.describe('X DOM dependency check', () => {
  test('checks XHunt required x.com DOM anchors in one logged-in tab', async ({ page }, testInfo) => {
    test.setTimeout(180_000);

    await expectXcomLoggedIn(page);
    const profileHandle = await getLoggedInProfileHandle(page);
    await slowDown();

    const missingBlockingContracts: string[] = [];
    const reports: string[] = [];
    let checkedContracts = 0;
    let skippedContracts = 0;
    let nonBlockingMissingContracts = 0;
    let currentPath = '';

    for (const contract of orderedContracts()) {
      const runtimePath = resolveRuntimeXcomPath(contract.path, profileHandle);

      if (!runtimePath) {
        const report = [
          '[X_DOM_DEPENDENCY_SKIPPED]',
          `name: ${contract.name}`,
          `path: ${contract.path}`,
          `selector: ${contract.selector}`,
          `level: ${contract.level}`,
          `usage: ${contract.usage}`,
          'reason: runtime path placeholder is missing; set XHUNT_E2E_TARGET_PROFILE_HANDLE to check this DOM dependency.',
        ].join('\n');
        reports.push(report);
        skippedContracts += 1;
        testInfo.annotations.push({
          type: 'warning',
          description: `Skipped X DOM dependency: ${contract.name}. Set XHUNT_E2E_TARGET_PROFILE_HANDLE to enable it.`,
        });
        continue;
      }

      if (currentPath !== runtimePath) {
        currentPath = runtimePath;
        await page.goto(xcomUrl(runtimePath), { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
        await slowDown();
      }

      await prepareContract(page, contract);

      const expectedMinCount = contract.minCount ?? 1;
      if (expectedMinCount > 0 && contract.level !== 'P2') {
        await page
          .locator(contract.selector)
          .first()
          .waitFor({
            state: 'attached',
            timeout: contract.level === 'P0' ? 45_000 : 15_000,
          })
          .catch(() => undefined);
      }

      const count = await page.locator(contract.selector).count();
      checkedContracts += 1;
      const report = [
        contract.level === 'P0' && count < expectedMinCount
          ? '[X_DOM_DEPENDENCY_BROKEN]'
          : '[X_DOM_DEPENDENCY_CHECK]',
        `name: ${contract.name}`,
        `page: ${page.url()}`,
        `selector: ${contract.selector}`,
        `level: ${contract.level}`,
        `usage: ${contract.usage}`,
        `expected: count >= ${expectedMinCount}`,
        `actual: count = ${count}`,
      ].join('\n');

      reports.push(report);

      if (contract.level === 'P0' && count < expectedMinCount) {
        missingBlockingContracts.push(report);
      } else if (count < expectedMinCount) {
        nonBlockingMissingContracts += 1;
        testInfo.annotations.push({
          type: 'warning',
          description: `X DOM non-blocking dependency missing: ${contract.name}`,
        });
        console.warn(report);
      }
    }

    await testInfo.attach('x-dom-dependency-report', {
      body: reports.join('\n\n---\n\n'),
      contentType: 'text/plain',
    });
    await attachEvidenceScreenshot(page, testInfo, 'x-dom-dependency-final-page');
    await attachEvidence(testInfo, [
      { name: '真实 x.com 当前账号', value: `@${profileHandle}` },
      { name: '检查锚点数量', value: `${checkedContracts}` },
      { name: '跳过锚点数量', value: `${skippedContracts}` },
      { name: 'P0 阻塞缺失数量', value: `${missingBlockingContracts.length}` },
      { name: 'P1/P2 非阻塞缺失数量', value: `${nonBlockingMissingContracts}` },
      { name: '详细 DOM 依赖检查附件', value: 'x-dom-dependency-report' },
    ]);

    expect(
      missingBlockingContracts,
      [
        'One or more P0 X DOM dependencies are broken.',
        'This means x.com DOM anchors required by XHunt are missing; do not treat this as a plugin feature failure.',
        '',
        ...missingBlockingContracts,
      ].join('\n'),
    ).toHaveLength(0);
  });
});
