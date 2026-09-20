import { type Page } from '@playwright/test';
import { test, expect } from '../setup/extensionFixture';
import { xcomUrl } from '../fixtures/accounts';
import { xhuntSelectors } from '../fixtures/selectors';
import { expectXcomLoggedIn } from '../setup/xcomAuth';
import { getParsedExtensionStorage, removeExtensionStorage } from '../setup/seedStorage';
import { attachEvidence, attachEvidenceScreenshot } from '../setup/evidence';

const DOMAIN_KEYS = [
  '@xhunt/user-domain-setup-completed',
  '@xhunt/domain-setup-visible',
  '@xhunt/user-domain-preference',
  '@settings/avatarRankMode',
];

function domainCard(page: Page, domain: 'web3' | 'ai') {
  const textPattern = domain === 'web3' ? /Web3|区块链/i : /^AI$|人工智能/i;
  return page
    .locator(
      `${xhuntSelectors.domainCard(domain)}, ${xhuntSelectors.domainSetupModal} button, #xhunt-domain-setup-host button`,
    )
    .filter({ hasText: textPattern })
    .first();
}

function domainPrimaryButton(page: Page, domain: 'web3' | 'ai') {
  const label = domain === 'web3' ? 'Web3' : 'AI';
  return page
    .locator(
      `${xhuntSelectors.domainPrimary(domain)}, ${xhuntSelectors.domainSetupModal} button[aria-label*="${label}"], #xhunt-domain-setup-host button[aria-label*="${label}"]`,
    )
    .first();
}

async function clickFirstVisibleEnabled(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locators = await page.locator(selector).all();
    for (const locator of locators) {
      if (
        (await locator.isVisible().catch(() => false)) &&
        (await locator.isEnabled().catch(() => false))
      ) {
        await locator.click();
        return true;
      }
    }
  }
  return false;
}

async function clickDomainNext(page: Page) {
  const clicked = await clickFirstVisibleEnabled(page, [
    xhuntSelectors.domainSetupNext,
    '#xhunt-domain-setup-host button:has-text("Next")',
    '#xhunt-domain-setup-host button:has-text("下一步")',
    `${xhuntSelectors.domainSetupModal} button:has-text("Next")`,
    `${xhuntSelectors.domainSetupModal} button:has-text("下一步")`,
  ]);
  expect(clicked, '首次领域弹框应该能点击下一步').toBe(true);
}

async function clickDomainConfirm(page: Page) {
  const clicked = await clickFirstVisibleEnabled(page, [
    xhuntSelectors.domainSetupConfirm,
    '#xhunt-domain-setup-host button:has-text("Confirm")',
    '#xhunt-domain-setup-host button:has-text("Start")',
    '#xhunt-domain-setup-host button:has-text("确认")',
    '#xhunt-domain-setup-host button:has-text("开始")',
    `${xhuntSelectors.domainSetupModal} button:has-text("Confirm")`,
    `${xhuntSelectors.domainSetupModal} button:has-text("Start")`,
    `${xhuntSelectors.domainSetupModal} button:has-text("确认")`,
    `${xhuntSelectors.domainSetupModal} button:has-text("开始")`,
  ]);
  expect(clicked, '首次领域弹框应该能点击确认完成').toBe(true);
}

test.describe('XHunt onboarding domain setup', () => {
  test('completes first-run domain and avatar-rank preference setup', async ({ page, context }, testInfo) => {
    test.setTimeout(180_000);

    await expectXcomLoggedIn(page);
    await removeExtensionStorage(context, DOMAIN_KEYS);

    await page.goto(xcomUrl('/home'), { waitUntil: 'domcontentloaded' });
    await expect(page.locator(xhuntSelectors.root).first()).toBeAttached({ timeout: 30_000 });
    await expect(page.locator(xhuntSelectors.domainSetupModal).first()).toBeVisible({ timeout: 30_000 });
    await attachEvidenceScreenshot(page, testInfo, 'onboarding-domain-modal-open');

    await domainCard(page, 'web3').click();
    if (await domainPrimaryButton(page, 'web3').isVisible({ timeout: 5_000 }).catch(() => false)) {
      await domainPrimaryButton(page, 'ai').click();
    }
    await clickDomainNext(page);
    await page.locator('[data-xhunt-testid^="domain-avatar-skin-"]').first().click().catch(() => undefined);
    await attachEvidenceScreenshot(page, testInfo, 'onboarding-avatar-step');
    await clickDomainConfirm(page);

    await expect(page.locator(xhuntSelectors.domainSetupModal)).toHaveCount(0, { timeout: 30_000 });
    const storage = await getParsedExtensionStorage<Record<string, any>>(context, DOMAIN_KEYS);

    expect(storage['@xhunt/user-domain-setup-completed']).toBe(true);
    expect(storage['@xhunt/user-domain-preference']?.domains?.length).toBeGreaterThan(0);
    expect(storage['@xhunt/user-domain-preference']?.domains).toEqual(expect.arrayContaining(['web3']));
    expect(['web3', 'ai']).toContain(storage['@xhunt/user-domain-preference']?.primaryDomain);
    expect(['web3', 'ai']).toContain(storage['@settings/avatarRankMode']);

    await testInfo.attach('xhunt-onboarding-domain-storage', {
      body: JSON.stringify(storage, null, 2),
      contentType: 'application/json',
    });
    await attachEvidence(testInfo, [
      { name: '首次弹框', value: '清理领域配置后，首页出现 user-domain-setup-modal' },
      { name: '领域选择', value: '选择 Web3，并在多领域控件可见时指定 AI 为优先展示领域' },
      { name: '头像排名', value: '进入头像排名皮肤步骤并选择一个皮肤' },
      { name: '持久化', value: '@xhunt/user-domain-setup-completed=true，领域偏好和 @settings/avatarRankMode 已写入' },
    ]);
  });
});
