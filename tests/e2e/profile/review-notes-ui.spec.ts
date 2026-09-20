import { type Page } from '@playwright/test';
import { test, expect } from '../setup/extensionFixture';
import { profilePath, xcomUrl } from '../fixtures/accounts';
import { xhuntSelectors } from '../fixtures/selectors';
import { expectXcomLoggedIn } from '../setup/xcomAuth';
import { getDecodedExtensionStorage } from '../setup/seedStorage';
import { normalizeXhuntState } from '../setup/xhuntUi';
import { attachEvidence, attachEvidenceScreenshot } from '../setup/evidence';

const PROFILE_HANDLE = process.env.XHUNT_E2E_REVIEW_NOTE_HANDLE || process.env.XHUNT_E2E_TARGET_PROFILE_HANDLE || 'DeFiTeddy2020';

function reviewOpenButton(page: Page) {
  return page
    .locator(
      [
        xhuntSelectors.reviewOpenButton,
        'main button:has-text("Submit Review")',
        'main button:has-text("Modify Review")',
        'main button:has-text("提交点评")',
        'main button:has-text("修改点评")',
      ].join(', '),
    )
    .first();
}

function reviewEditor(page: Page) {
  return page.locator(`${xhuntSelectors.reviewEditor}, textarea[placeholder]`).first();
}

function reviewCommentInput(page: Page) {
  return page.locator(`${xhuntSelectors.reviewCommentInput}, textarea[placeholder]`).last();
}

function reviewSubmitButton(page: Page) {
  return page
    .locator(
      [
        xhuntSelectors.reviewSubmitButton,
        `${xhuntSelectors.reviewEditor} button:has-text("Submit Review")`,
        `${xhuntSelectors.reviewEditor} button:has-text("Modify Review")`,
        `${xhuntSelectors.reviewEditor} button:has-text("提交点评")`,
        `${xhuntSelectors.reviewEditor} button:has-text("修改点评")`,
      ].join(', '),
    )
    .first();
}

function reviewDeleteButton(page: Page) {
  return page
    .locator(
      [
        xhuntSelectors.reviewDeleteButton,
        'button:has-text("Delete")',
        'button:has-text("删除")',
      ].join(', '),
    )
    .first();
}

function noteEntry(page: Page, noteText?: string) {
  const selectors = [xhuntSelectors.noteEntry, 'main :text-is("Note")', 'main :text-is("备注")'];
  if (noteText) selectors.push(`main :text("${noteText}")`);
  return page.locator(selectors.join(', ')).first();
}

function noteInput(page: Page) {
  return page.locator(`${xhuntSelectors.noteInput}, ${xhuntSelectors.noteEditor} textarea, textarea[placeholder*="note"], textarea[placeholder*="备注"]`).first();
}

function noteSaveButton(page: Page) {
  return page
    .locator(
      [
        xhuntSelectors.noteSaveButton,
        `${xhuntSelectors.noteEditor} button:has-text("Save")`,
        `${xhuntSelectors.noteEditor} button:has-text("保存")`,
      ].join(', '),
    )
    .first();
}

test.describe('XHunt review and notes UI', () => {
  test('opens review and note editors, submits review, saves and clears note through UI', async ({ page, context }, testInfo) => {
    test.setTimeout(240_000);

    await normalizeXhuntState(context);
    await expectXcomLoggedIn(page);
    const storage = await getDecodedExtensionStorage<Record<string, any>>(context, ['@xhunt/token']);
    expect(
      typeof storage['@xhunt/token'] === 'string' && storage['@xhunt/token'].length > 10,
      'Review/Notes UI 写入需要真实 XHunt 登录态。请先跑 plugin-auth。',
    ).toBe(true);

    await page.goto(xcomUrl(profilePath(PROFILE_HANDLE)), { waitUntil: 'domcontentloaded' });
    await page.locator(xhuntSelectors.panelCloseButton).first().click().catch(() => undefined);
    await expect(page.locator(xhuntSelectors.root).first()).toBeAttached({ timeout: 30_000 });
    await expect(page.locator('main [data-testid="UserName"]').first()).toBeVisible({ timeout: 30_000 });
    await attachEvidenceScreenshot(page, testInfo, 'review-note-profile-before-actions');

    const reviewButton = reviewOpenButton(page);
    await expect(
      reviewButton,
      `@${PROFILE_HANDLE} Profile 页应该显示 Review 入口，用于验证真实打开评论编辑器`,
    ).toBeVisible({ timeout: 60_000 });
    await reviewButton.click();
    await expect(reviewEditor(page)).toBeVisible({ timeout: 30_000 });
    await attachEvidenceScreenshot(page, testInfo, 'review-editor-opened');

    await page.locator('[data-xhunt-testid="review-star-5"]').first().click();
    const firstTag = page
      .locator('[data-xhunt-testid^="review-preset-tag-"], button:has-text("投研"), button:has-text("技术领先"), button:has-text("Research")')
      .first();
    await expect(firstTag, 'Review 编辑器应该展示可选标签').toBeVisible({ timeout: 30_000 });
    await firstTag.click();
    const reviewText = `XHunt E2E UI review ${Date.now()}`.slice(0, 80);
    await reviewCommentInput(page).fill(reviewText);
    await expect(reviewSubmitButton(page)).toBeEnabled({ timeout: 30_000 });
    await attachEvidenceScreenshot(page, testInfo, 'review-editor-filled-before-submit');

    await reviewSubmitButton(page).click();
    await expect(page.locator(xhuntSelectors.reviewEditor)).toHaveCount(0, { timeout: 60_000 });
    await attachEvidenceScreenshot(page, testInfo, 'review-after-submit-visible');

    await reviewOpenButton(page).click();
    await expect(reviewEditor(page)).toBeVisible({ timeout: 30_000 });
    await expect(reviewCommentInput(page)).toHaveValue(reviewText, { timeout: 30_000 });
    const deleteButton = reviewDeleteButton(page);
    await expect(deleteButton, '提交后再次打开 Review 编辑器应该出现删除按钮，用于清理 E2E 点评').toBeVisible({ timeout: 30_000 });
    await attachEvidenceScreenshot(page, testInfo, 'review-editor-reopened-with-submitted-comment');
    await deleteButton.click();
    await expect(page.locator(xhuntSelectors.reviewEditor)).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator('main').getByText(reviewText)).toHaveCount(0, { timeout: 60_000 });
    await attachEvidenceScreenshot(page, testInfo, 'review-after-delete-cleaned');

    const entry = noteEntry(page);
    await expect(
      entry,
      `@${PROFILE_HANDLE} Profile 页应该显示 Note/备注入口，用于验证真实打开备注编辑器`,
    ).toBeVisible({ timeout: 60_000 });
    await entry.click();
    await expect(page.locator(xhuntSelectors.noteEditor).first()).toBeVisible({ timeout: 30_000 });
    await attachEvidenceScreenshot(page, testInfo, 'note-editor-opened');

    const noteText = `E2E${Date.now()}`.slice(0, 30);
    await noteInput(page).fill(noteText);
    await noteSaveButton(page).click();
    await expect(page.locator(xhuntSelectors.noteEditor)).toHaveCount(0, { timeout: 45_000 });
    await expect(page.locator('main')).toContainText(noteText, { timeout: 45_000 });
    await attachEvidenceScreenshot(page, testInfo, 'note-after-save-visible');

    await noteEntry(page, noteText).click();
    await expect(page.locator(xhuntSelectors.noteEditor).first()).toBeVisible({ timeout: 30_000 });
    await noteInput(page).fill('');
    await attachEvidenceScreenshot(page, testInfo, 'note-editor-before-clear-save');
    await noteSaveButton(page).click();
    await expect(page.locator(xhuntSelectors.noteEditor)).toHaveCount(0, { timeout: 45_000 });
    await expect(page.locator('main').getByText(noteText)).toHaveCount(0, { timeout: 45_000 });
    await attachEvidenceScreenshot(page, testInfo, 'note-after-clear-cleaned');

    await attachEvidence(testInfo, [
      { name: '目标 Profile', value: `@${PROFILE_HANDLE}` },
      { name: 'Review 打开', value: '真实点击 Review 入口打开 review-editor，并截图 review-editor-opened' },
      { name: 'Review 提交', value: `选择 5 星和标签后提交真实 UI 点评：${reviewText}，提交后编辑器关闭` },
      { name: 'Review 读回/清理', value: '重新打开 Review 编辑器验证评论文本已读回，并点击删除清理 E2E 点评' },
      { name: 'Note 打开', value: '真实点击 Note/备注入口打开 note-editor，并截图 note-editor-opened' },
      { name: 'Note 保存/清空', value: `保存备注 ${noteText} 后验证展示，再重新打开备注编辑器清空并验证文本消失` },
    ]);
  });
});
