import fs from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

const LATEST_REPORT_DIR = 'tests/e2e/reports/latest';
const PDF_REPORT = 'report.pdf';
const PLAYWRIGHT_OUTPUT_DIR = 'test-results';

const STATUS_TEXT: Record<string, string> = {
  passed: '通过',
  failed: '失败',
  timedOut: '超时',
  skipped: '跳过',
  interrupted: '中断',
  expected: '符合预期',
  unexpected: '异常',
  flaky: '不稳定',
};

const TEST_NAME_ZH: Record<string, string> = {
  'XHunt real API validation › fetches real twitter user data through the installed plugin':
    '真实 API 校验：通过已安装插件环境拉取真实 Twitter 用户数据',
  'XHunt plugin auth flow › logs in through real XHunt Twitter OAuth flow':
    '插件真实登录：通过真实 XHunt Twitter OAuth 登录并验证 token/user',
  'XHunt plugin auth flow › shows logged-out and logged-in plugin states':
    '插件登录态：验证未登录/已登录两种面板状态（模拟状态）',
  'X DOM dependency check › checks XHunt required x.com DOM anchors in one logged-in tab':
    'X DOM 依赖检查：在同一个已登录页签检查 XHunt 依赖的 x.com 锚点',
  'XHunt language switch › switches settings page between Chinese and English':
    '语言切换：设置页中英文切换',
  'XHunt settings page › opens settings and persists a basic switch':
    '设置页：打开设置并验证基础开关持久化',
  'XHunt settings page › opens settings and persists multiple core switches':
    '设置页：打开设置并验证多个核心开关持久化',
  'XHunt panel navigation › navigates to settings and reopens after close':
    '面板导航：设置页跳转、返回、关闭后重新打开',
  'XHunt theme sync › syncs plugin theme from real x.com display background clicks':
    '主题同步：通过 X 显示设置页真实点击背景选项切换明暗主题',
  'XHunt onboarding domain setup › completes first-run domain and avatar-rank preference setup':
    '首次引导：完成领域选择和头像排名偏好设置',
  'XHunt messages page › opens messages page from panel header and returns to panel':
    '消息页：从面板顶部进入消息页并验证导航联动',
  'XHunt KOL AI Chat › opens KOL AI chat dialog and validates basic input/send states':
    'KOL AI Chat：打开对话框并验证输入/发送基础状态',
  'XHunt profile core modules › renders profile data modules and toggles collapsed insights when available':
    'Profile 核心模块：渲染资料模块并验证可用的展开/折叠',
  'XHunt review and notes UI › opens review editor and saves/clears a short note through UI':
    '评论与备注 UI：打开评论编辑器并通过界面保存/清空备注',
  'XHunt review and notes UI › opens review and note editors, submits review, saves and clears note through UI':
    '评论与备注 UI：打开评论和备注编辑器，通过界面提交点评、保存并清空备注',
  'XHunt avatar rank mode and skin › switches Web3/AI avatar rank mode and persists selected skin':
    '头像排名：切换 Web3/AI 模式并验证皮肤选择',
  'XHunt settings effects › core switches actually hide and restore their page surfaces':
    '设置效果：核心开关真实控制页面功能显示隐藏',
  'XHunt token highlight and analysis › highlights supported token text and opens token analysis on hover':
    'Token 分析：高亮支持的 Token 并 hover 打开分析面板',
  'XHunt real write API validation › creates and deletes real review comment and user note through signed plugin API':
    '真实写入接口校验：创建/查询/删除评论和备注',
};

interface ApiValidationSummary {
  name: string;
  method: string;
  endpoint: string;
  baseUrl?: string;
  target?: string;
  calledBy?: string;
  assertions: string[];
}

interface EvidenceItem {
  name: string;
  value: string;
}

interface ReportAttachment {
  name: string;
  contentType?: string;
  imageDataUri?: string;
  text?: string;
  omitted?: string;
}

interface TestAnnotationSummary {
  type: string;
  description?: string;
}

interface TestSummary {
  title: string;
  titleZh: string;
  file: string;
  project: string;
  status: string;
  durationMs: number;
  retry: number;
  error?: string;
  annotations: TestAnnotationSummary[];
  evidence: EvidenceItem[];
  apiValidations: ApiValidationSummary[];
  attachments: ReportAttachment[];
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeError(result: TestResult) {
  const error = result.error || result.errors?.[0];
  const message = error?.message || error?.stack || '';
  return message.replace(/\u001b\[[0-9;]*m/g, '').trim();
}

function collectTests(suite: Suite): TestCase[] {
  return suite.allTests();
}

function testDisplayTitle(test: TestCase) {
  return test.titlePath().slice(3).join(' › ');
}

function parseEvidence(result: TestResult | undefined): EvidenceItem[] {
  const attachment = result?.attachments.find(
    (item) => item.name === 'xhunt-test-evidence',
  );

  if (!attachment?.body) return [];

  try {
    const parsed = JSON.parse(attachment.body.toString()) as EvidenceItem[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.name === 'string' &&
          typeof item.value === 'string',
      )
      .map((item) => ({ name: item.name, value: item.value }));
  } catch {
    return [];
  }
}

function parseApiValidations(result: TestResult | undefined, title: string) {
  const attachment = result?.attachments.find(
    (item) => item.name === 'xhunt-api-validations' || item.name === 'xhunt-api-contracts',
  );

  if (attachment?.body) {
    try {
      const parsed = JSON.parse(attachment.body.toString()) as ApiValidationSummary[];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall back to static metadata below
    }
  }

  if (
    title ===
    'XHunt real API validation › fetches real twitter user data through the installed plugin'
  ) {
    return [
      {
        name: 'Twitter 用户数据',
        method: 'GET',
        endpoint: '/api/xhunt/proxy/public/fetch/twitter/user',
        baseUrl:
          process.env.XHUNT_E2E_API_BASE_URL ||
          (process.env.XHUNT_E2E_API_ENV === 'dev'
            ? 'https://test-kb.xhunt.ai/api'
            : 'https://kb.xhunt.ai/api'),
        target:
          process.env.XHUNT_E2E_API_PROFILE_HANDLE ||
          process.env.XHUNT_E2E_KOL_PROFILE_HANDLE ||
          process.env.XHUNT_E2E_TARGET_PROFILE_HANDLE ||
          '@xhunt_ai',
        calledBy: '已安装 XHunt 插件的 service worker，携带 XHunt v2 签名 headers',
        assertions: [
          'HTTP status 为 2xx',
          '响应是 JSON',
          'body.data.data 为非空对象',
          '返回数据包含 twitter_id / twitterId / user_id / id / username / screen_name / basicInfo / basic_info 中至少一个身份字段',
        ],
      },
    ];
  }

  return [];
}

function readAttachmentBuffer(attachment: { path?: string; body?: Buffer }) {
  if (attachment.body) return attachment.body;
  if (attachment.path && fs.existsSync(attachment.path)) {
    return fs.readFileSync(attachment.path);
  }
  return undefined;
}

function formatTextAttachment(buffer: Buffer, contentType?: string) {
  const raw = buffer.toString('utf-8');
  if (contentType === 'application/json') {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
  return raw;
}

function attachmentToReport(
  attachment: { name: string; path?: string; contentType?: string; body?: Buffer },
): ReportAttachment | null {
  const contentType = attachment.contentType || '';

  if (contentType.startsWith('image/') && !attachment.name.startsWith('evidence-')) {
    return null;
  }

  const buffer = readAttachmentBuffer(attachment);

  if (!buffer) {
    return {
      name: attachment.name,
      contentType,
      omitted: '附件内容不存在或已被 Playwright 清理。',
    };
  }

  if (contentType.startsWith('image/')) {
    return {
      name: attachment.name,
      contentType,
      imageDataUri: `data:${contentType};base64,${buffer.toString('base64')}`,
    };
  }

  if (
    contentType === 'application/json' ||
    contentType.startsWith('text/') ||
    attachment.name.includes('error-context')
  ) {
    return {
      name: attachment.name,
      contentType,
      text: formatTextAttachment(buffer, contentType),
    };
  }

  // trace.zip / video 等二进制调试资源不进入最终 PDF，避免生成大量无用资源。
  return null;
}

function hasReportEvidence(item: TestSummary) {
  return (
    item.evidence.length > 0 ||
    item.apiValidations.length > 0 ||
    item.attachments.some(
      (attachment) =>
        Boolean(attachment.imageDataUri) ||
        Boolean(attachment.text) ||
        Boolean(attachment.omitted),
    )
  );
}

function hasWarning(item: TestSummary) {
  return item.annotations.some((annotation) => annotation.type === 'warning');
}

function warningDescriptions(item: TestSummary) {
  return item.annotations
    .filter((annotation) => annotation.type === 'warning')
    .map((annotation) => annotation.description || '未提供 warning 描述');
}

function buildLatestDir() {
  const latestDir = path.resolve(LATEST_REPORT_DIR);
  fs.rmSync(latestDir, { recursive: true, force: true });
  fs.mkdirSync(latestDir, { recursive: true });
  fs.writeFileSync(path.join(latestDir, '.gitkeep'), '', 'utf-8');
  return latestDir;
}

function cleanupPlaywrightOutput(config?: FullConfig) {
  const outputDirs = new Set<string>([path.resolve(PLAYWRIGHT_OUTPUT_DIR)]);

  for (const project of config?.projects || []) {
    if (project.outputDir) outputDirs.add(path.resolve(project.outputDir));
  }

  for (const outputDir of outputDirs) {
    try {
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
    } catch {
      // 报告已经生成；清理调试临时目录失败不影响测试结果。
    }
  }
}

async function writePdfReport(html: string, pdfPath: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '12mm',
        right: '10mm',
        bottom: '12mm',
        left: '10mm',
      },
    });
  } finally {
    await browser.close();
  }
}

class ZhSummaryReporter implements Reporter {
  private config?: FullConfig;
  private suite?: Suite;

  onBegin(config: FullConfig, suite: Suite) {
    this.config = config;
    this.suite = suite;
  }

  async onEnd(result: FullResult) {
    const latestDir = buildLatestDir();

    const tests = this.suite ? collectTests(this.suite) : [];
    const summaries = tests.map<TestSummary>((test) => {
      const latestResult = test.results[test.results.length - 1];
      const displayTitle = testDisplayTitle(test);
      const project = test.parent.project()?.name || '-';
      const file = path.relative(process.cwd(), test.location.file);
      const status = latestResult?.status || 'skipped';

      return {
        title: displayTitle,
        titleZh: TEST_NAME_ZH[displayTitle] || displayTitle,
        file,
        project,
        status,
        durationMs: latestResult?.duration || 0,
        retry: latestResult?.retry || 0,
        error: latestResult ? normalizeError(latestResult) : undefined,
        annotations:
          latestResult?.annotations.map((annotation) => ({
            type: annotation.type,
            description: annotation.description,
          })) || [],
        evidence: parseEvidence(latestResult),
        apiValidations: parseApiValidations(latestResult, displayTitle),
        attachments:
          latestResult?.attachments
            .filter(
              (attachment) =>
                !['xhunt-api-validations', 'xhunt-api-contracts', 'xhunt-test-evidence'].includes(
                  attachment.name,
                ),
            )
            .map((attachment) => attachmentToReport(attachment))
            .filter(Boolean) as ReportAttachment[] || [],
      };
    });

    const total = summaries.length;
    const passed = summaries.filter(
      (item) => item.status === 'passed' && hasReportEvidence(item) && !hasWarning(item),
    ).length;
    const passedWithWarnings = summaries.filter(
      (item) => item.status === 'passed' && hasWarning(item),
    ).length;
    const passedWithoutEvidence = summaries.filter(
      (item) => item.status === 'passed' && !hasWarning(item) && !hasReportEvidence(item),
    ).length;
    const failed = summaries.filter((item) =>
      ['failed', 'timedOut', 'interrupted'].includes(item.status),
    ).length;
    const skipped = summaries.filter((item) => item.status === 'skipped').length;
    const totalDuration = summaries.reduce((sum, item) => sum + item.durationMs, 0);
    const generatedAt = new Date().toLocaleString('zh-CN', {
      timeZone: this.config?.metadata?.timezoneId || 'Asia/Shanghai',
      hour12: false,
    });

    const reportData = {
      status: result.status,
      total,
      passed,
      passedWithWarnings,
      failed,
      passedWithoutEvidence,
      skipped,
      totalDuration,
      generatedAt,
      summaries,
    };
    const html = this.renderHtml(reportData);
    const pdfPath = path.join(latestDir, PDF_REPORT);
    await writePdfReport(html, pdfPath);
    cleanupPlaywrightOutput(this.config);

    console.log(`\n中文测试 PDF 已生成：${path.join(LATEST_REPORT_DIR, PDF_REPORT)}`);
  }

  private renderHtml(data: {
    status: string;
    total: number;
    passed: number;
    passedWithWarnings: number;
    failed: number;
    passedWithoutEvidence: number;
    skipped: number;
    totalDuration: number;
    generatedAt: string;
    summaries: TestSummary[];
  }) {
    const failures = data.summaries.filter((item) => item.error);
    const apiValidations = data.summaries.flatMap((item) => item.apiValidations);

    return `<!doctype html>
<html lang='zh-CN'>
<head>
  <meta charset='utf-8' />
  <title>测试报告</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f8fafc; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 12px; line-height: 1.55; }
    main { max-width: 1120px; margin: 0 auto; padding: 0; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    h2 { font-size: 20px; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #dbeafe; }
    h3 { font-size: 16px; margin: 18px 0 8px; }
    h4 { font-size: 13px; margin: 10px 0 6px; }
    .hero { background: linear-gradient(135deg, #0f172a, #1d4ed8); color: white; border-radius: 18px; padding: 22px 24px; margin-bottom: 18px; }
    .muted { color: #64748b; }
    .hero .muted { color: #cbd5e1; }
    .cards { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; margin-top: 16px; }
    .card { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18); border-radius: 12px; padding: 10px; }
    .label { color: #cbd5e1; font-size: 11px; }
    .value { font-size: 20px; font-weight: 800; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 14px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 7px 8px; text-align: left; vertical-align: top; }
    th { color: #334155; background: #eff6ff; font-size: 11px; }
    td { font-size: 11px; }
    tr:last-child td { border-bottom: 0; }
    code, pre { font-family: 'SFMono-Regular', Consolas, monospace; }
    code { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 1px 4px; }
    pre { background: #0f172a; color: #e2e8f0; border-radius: 10px; padding: 10px; overflow-wrap: anywhere; white-space: pre-wrap; font-size: 9px; max-height: 520px; overflow: hidden; }
    .status-passed { color: #16a34a; font-weight: 700; }
    .status-failed, .status-timedOut, .status-interrupted { color: #dc2626; font-weight: 700; }
    .status-skipped { color: #ca8a04; font-weight: 700; }
    .risk-warning { color: #d97706; font-weight: 700; }
    .risk-ok { color: #16a34a; font-weight: 700; }
    .risk-missing { color: #dc2626; font-weight: 700; }
    .test-section { break-inside: avoid; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px; margin-bottom: 14px; }
    ul { padding-left: 17px; margin: 6px 0; }
    li { margin: 2px 0; }
    .screens { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 10px; }
    figure { margin: 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 6px; break-inside: avoid; }
    img { width: 100%; border-radius: 7px; display: block; }
    figcaption { font-size: 10px; color: #64748b; margin-top: 4px; overflow-wrap: anywhere; }
    .attachment-text { margin: 8px 0 12px; break-inside: avoid; }
    .api-table td { font-size: 10px; }
    .page-break { break-before: page; }
    @page { size: A4; margin: 12mm 10mm; }
  </style>
</head>
<body>
<main>
  <section class='hero'>
    <h1>测试报告</h1>
    <div class='muted'>报告时间：${escapeHtml(data.generatedAt)}</div>
    <div class='cards'>
      <div class='card'><div class='label'>总体状态</div><div class='value'>${escapeHtml(STATUS_TEXT[data.status] || data.status)}</div></div>
      <div class='card'><div class='label'>用例总数</div><div class='value'>${data.total}</div></div>
      <div class='card'><div class='label'>纯通过</div><div class='value'>${data.passed}</div></div>
      <div class='card'><div class='label'>通过但有 warning</div><div class='value'>${data.passedWithWarnings}</div></div>
      <div class='card'><div class='label'>通过但缺证据</div><div class='value'>${data.passedWithoutEvidence}</div></div>
      <div class='card'><div class='label'>失败/异常</div><div class='value'>${data.failed}</div></div>
      <div class='card'><div class='label'>累计耗时</div><div class='value'>${escapeHtml(formatDuration(data.totalDuration))}</div></div>
    </div>
  </section>

  <h2>用例明细</h2>
  <table>
    <thead><tr><th>状态</th><th>风险标识</th><th>证据</th><th>中文说明</th><th>原始用例名</th><th>文件</th><th>耗时</th></tr></thead>
    <tbody>
      ${data.summaries
        .map(
          (item) => `<tr>
        <td class='status-${escapeHtml(item.status)}'>${escapeHtml(STATUS_TEXT[item.status] || item.status)}</td>
        <td class='${hasWarning(item) ? 'risk-warning' : hasReportEvidence(item) ? 'risk-ok' : 'risk-missing'}'>${hasWarning(item) ? 'WARNING' : hasReportEvidence(item) ? '正常' : '缺证据'}</td>
        <td>${hasReportEvidence(item) ? '有' : '缺失'}</td>
        <td>${escapeHtml(item.titleZh)}</td>
        <td>${escapeHtml(item.title)}</td>
        <td><code>${escapeHtml(item.file)}</code></td>
        <td>${escapeHtml(formatDuration(item.durationMs))}</td>
      </tr>`,
        )
        .join('\n')}
    </tbody>
  </table>

  <h2>测试证据</h2>
  ${data.summaries
    .map((item) => this.renderTestEvidence(item))
    .join('\n')}

  <h2 class='page-break'>真实 API 数据接口</h2>
  ${
    apiValidations.length
      ? `<table class='api-table'>
    <thead><tr><th>接口名称</th><th>Method</th><th>Base URL</th><th>Path</th><th>测试目标</th><th>调用方式</th><th>验证内容</th></tr></thead>
    <tbody>
      ${apiValidations
        .map(
          (item) => `<tr>
        <td>${escapeHtml(item.name)}</td>
        <td><code>${escapeHtml(item.method)}</code></td>
        <td><code>${escapeHtml(item.baseUrl || '-')}</code></td>
        <td><code>${escapeHtml(item.endpoint)}</code></td>
        <td>${escapeHtml(item.target || '-')}</td>
        <td>${escapeHtml(item.calledBy || '-')}</td>
        <td><ul>${item.assertions.map((assertion) => `<li>${escapeHtml(assertion)}</li>`).join('')}</ul></td>
      </tr>`,
        )
        .join('\n')}
    </tbody>
  </table>`
      : '<p>本次没有执行真实 API 数据校验用例。</p>'
  }

  <h2>失败详情</h2>
  ${
    failures.length
      ? failures
          .map(
            (item) => `<section class='test-section'>
      <h3>${escapeHtml(item.titleZh)}</h3>
      <p class='muted'>${escapeHtml(item.file)} · ${escapeHtml(formatDuration(item.durationMs))}</p>
      <pre>${escapeHtml(item.error || '')}</pre>
    </section>`,
          )
          .join('\n')
      : '<p>本次没有失败用例。</p>'
  }
</main>
</body>
</html>`;
  }

  private renderTestEvidence(item: TestSummary) {
    const images = item.attachments.filter((attachment) => attachment.imageDataUri);
    const texts = item.attachments.filter((attachment) => attachment.text);
    const omitted = item.attachments.filter((attachment) => attachment.omitted);
    const warnings = warningDescriptions(item);

    if (!item.evidence.length && !warnings.length && !images.length && !texts.length && !omitted.length) {
      return '';
    }

    return `<section class='test-section'>
      <h3>${escapeHtml(item.titleZh)}</h3>
      ${
        warnings.length
          ? `<h4 class='risk-warning'>Warning 记录（不计入纯通过）</h4><ul>${warnings
              .map((warning) => `<li>${escapeHtml(warning)}</li>`)
              .join('')}</ul>`
          : ''
      }
      ${
        item.evidence.length
          ? `<ul>${item.evidence
              .map(
                (evidence) =>
                  `<li><strong>${escapeHtml(evidence.name)}：</strong>${escapeHtml(evidence.value)}</li>`,
              )
              .join('')}</ul>`
          : ''
      }
      ${
        images.length
          ? `<div class='screens'>${images
              .map(
                (attachment) =>
                  `<figure><img src='${attachment.imageDataUri}' alt='${escapeHtml(attachment.name)}'/><figcaption>${escapeHtml(attachment.name)}</figcaption></figure>`,
              )
              .join('')}</div>`
          : ''
      }
      ${
        texts.length
          ? texts
              .map(
                (attachment) => `<div class='attachment-text'>
            <h4>${escapeHtml(attachment.name)}${attachment.contentType ? `（${escapeHtml(attachment.contentType)}）` : ''}</h4>
            <pre>${escapeHtml(attachment.text || '')}</pre>
          </div>`,
              )
              .join('')
          : ''
      }
      ${
        omitted.length
          ? `<ul>${omitted
              .map(
                (attachment) =>
                  `<li class='muted'>${escapeHtml(attachment.name)}：${escapeHtml(attachment.omitted || '')}</li>`,
              )
              .join('')}</ul>`
          : ''
      }
    </section>`;
  }
}

export default ZhSummaryReporter;
