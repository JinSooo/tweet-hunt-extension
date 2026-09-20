import type { Page, TestInfo } from '@playwright/test';

export interface TestEvidenceItem {
  name: string;
  value: string;
}

export async function attachEvidence(
  testInfo: TestInfo,
  evidence: TestEvidenceItem[],
) {
  await testInfo.attach('xhunt-test-evidence', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });
}

export async function attachEvidenceScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
) {
  const fileName = `${name.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}.png`;
  const screenshotPath = testInfo.outputPath(fileName);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await testInfo.attach(`evidence-${name}`, {
    path: screenshotPath,
    contentType: 'image/png',
  });
}
