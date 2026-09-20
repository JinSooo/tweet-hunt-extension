import { type Page } from '@playwright/test';
import { test, expect } from '../setup/extensionFixture';
import { profilePath, xcomUrl } from '../fixtures/accounts';
import { xhuntSelectors } from '../fixtures/selectors';
import { expectXcomLoggedIn } from '../setup/xcomAuth';
import { normalizeXhuntState } from '../setup/xhuntUi';
import { attachEvidence, attachEvidenceScreenshot } from '../setup/evidence';

const PROFILE_HANDLE = process.env.XHUNT_E2E_KOL_CHAT_HANDLE || 'DeFiTeddy2020';
const CHAT_PROMPT = 'Who are you?';

function kolAiChatButton(page: Page) {
  return page
    .locator(
      [
        `${xhuntSelectors.kolAiChatButton} button`,
        xhuntSelectors.kolAiChatButton,
        'main button[title*="Persona"]',
        'main button:has-text("Persona")',
        'main button:has-text("AI Persona")',
        'main button:has-text("Teddy Persona")',
        'main button:has-text("AI 分身")',
        'main button:has-text("思维")',
      ].join(', '),
    )
    .first();
}

function kolAiChatDialog(page: Page) {
  return page
    .locator(
      [
        xhuntSelectors.kolAiChatDialog,
        'div:has(input[placeholder*="question"]):has(button[title="Send"])',
        'div:has(input[placeholder*="问题"]):has(button[title="发送"])',
      ].join(', '),
    )
    .first();
}

function kolAiChatInput(page: Page) {
  return page
    .locator(
      [
        xhuntSelectors.kolAiChatInput,
        'input[placeholder*="question"]',
        'input[placeholder*="问题"]',
      ].join(', '),
    )
    .first();
}

function kolAiChatSend(page: Page) {
  return page
    .locator(
      [
        xhuntSelectors.kolAiChatSend,
        'button[title="Send"]',
        'button[title="发送"]',
      ].join(', '),
    )
    .first();
}

test.describe('XHunt KOL AI Chat', () => {
  test('opens KOL AI chat dialog and validates basic input/send states', async ({ page, context }, testInfo) => {
    test.setTimeout(180_000);

    await normalizeXhuntState(context);
    await expectXcomLoggedIn(page);
    await page.goto(xcomUrl(profilePath(PROFILE_HANDLE)), { waitUntil: 'domcontentloaded' });
    await expect(page.locator(xhuntSelectors.root).first()).toBeAttached({ timeout: 30_000 });
    await expect(page.locator('main [data-testid="UserName"]').first()).toBeVisible({ timeout: 30_000 });
    await page.locator(xhuntSelectors.panelCloseButton).first().click().catch(() => undefined);

    const chatButton = kolAiChatButton(page);
    await expect(
      chatButton,
      `@${PROFILE_HANDLE} Profile 页应该渲染 KOL AI Chat / Persona 按钮`,
    ).toBeVisible({ timeout: 60_000 });
    await attachEvidenceScreenshot(page, testInfo, 'kol-ai-chat-button-visible');

    await chatButton.click();
    const dialog = kolAiChatDialog(page);
    const input = kolAiChatInput(page);
    const sendButton = kolAiChatSend(page);
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(sendButton).toBeDisabled({ timeout: 30_000 });
    await input.fill(CHAT_PROMPT);
    await expect(sendButton).toBeEnabled({ timeout: 30_000 });
    await attachEvidenceScreenshot(page, testInfo, 'kol-ai-chat-dialog-input-ready');

    await sendButton.click();
    await expect(input).toHaveValue('', { timeout: 30_000 });
    await expect(dialog).toContainText(CHAT_PROMPT, { timeout: 30_000 });
    await attachEvidenceScreenshot(page, testInfo, 'kol-ai-chat-message-sent');

    await page.locator(xhuntSelectors.kolAiChatClose).first().click();
    await expect(page.locator(xhuntSelectors.kolAiChatDialog)).toHaveCount(0, { timeout: 30_000 });

    await attachEvidence(testInfo, [
      { name: '目标 Profile', value: `@${PROFILE_HANDLE}` },
      { name: 'Chat 入口', value: 'KOL AI Chat / Teddy Persona 按钮可见，并通过真实点击打开 kol-ai-chat-dialog' },
      { name: '输入状态', value: '空输入发送按钮 disabled，输入 Who are you? 后发送按钮 enabled' },
      { name: '发送验证', value: '点击发送后输入框清空，kol-ai-chat-dialog 中出现用户消息 Who are you?' },
      { name: '关闭', value: '点击关闭后 kol-ai-chat-dialog 卸载' },
    ]);
  });
});
