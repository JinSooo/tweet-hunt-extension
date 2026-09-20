# XHunt Real x.com E2E

这套测试只把真实 `x.com` 当作 XHunt 插件运行环境，不测试 X 自身功能。

## 运行前准备

1. 确保已有扩展构建产物：
   - 默认优先使用 `build/chrome-mv3-dev`
   - 不存在时使用 `build/chrome-mv3-prod`
   - 也可以指定：`XHUNT_EXTENSION_PATH=/abs/path/to/extension`

2. 生成真实 x.com 测试账号登录态：

```bash
node script/open-xcom-auth-profile.mjs
```

这个命令会用 **系统 Google Chrome** 打开一个专用 profile：

```text
tests/.auth/xcom-reader-profile
```

请在这个普通 Chrome 窗口里手动登录 x.com。登录成功后，**保持该 Chrome 窗口打开**，再到另一个终端运行 E2E 测试。测试会通过 CDP 连接这个已登录的普通 Chrome，而不是重新打开一个未登录浏览器。

注意：不要优先使用 Playwright codegen 输入账号密码登录，X 可能识别自动化浏览器导致无法登录。Playwright codegen 只作为备用方案。

该 profile 包含真实登录态，已加入 `.gitignore`，不要提交。

### 关于“直接用我当前打开的 Chrome”

Playwright 只能连接已经开启 DevTools Protocol 的 Chrome。普通已经打开的 Chrome，如果启动时没有带远程调试能力，测试进程无法中途接管它。

另外，从 Chrome 136 起，Chrome 不再允许对默认用户数据目录使用 `--remote-debugging-port` / `--remote-debugging-pipe`，必须配合一个非默认 `--user-data-dir`。因此本地 E2E 推荐继续使用 `tests/.auth/xcom-reader-profile` 这个专用 profile：它不是假环境，仍然访问真实 `x.com`、使用真实账号、可以手动安装真实 XHunt 插件，只是和日常主浏览器隔离。

`node script/open-xcom-auth-profile.mjs` 默认不再用命令行自动加载扩展，因为 Chrome Stable 对 `--load-extension` / `--disable-extensions-except` 有限制，而且这些参数会让当前窗口的扩展安装行为变得异常。请在该窗口里手动安装一次：

1. 打开 `chrome://extensions/`
2. 打开 Developer mode
3. 点击 Load unpacked
4. 选择 `build/chrome-mv3-prod` 或 `build/chrome-mv3-dev`
5. 刷新 `https://x.com/home`

完整 E2E 会按扩展 manifest name 查找 XHunt service worker，不再假设当前 Chrome 里只有一个扩展。

如果你确实要实验命令行自动加载，可以显式设置：

```bash
XHUNT_E2E_LOAD_EXTENSION=true node script/open-xcom-auth-profile.mjs
```

但本地真实测试推荐手动 Load unpacked。

3. 建议配置固定测试账号和推文：

```bash
export XHUNT_E2E_PROFILE_HANDLE='your_reader_handle'
export XHUNT_E2E_STATUS_URL='https://x.com/your_reader_handle/status/1234567890'
export XHUNT_E2E_SEARCH_KEYWORD='BTC'
```



### 外部目标账号

`placementTracking` / follow button 这类关系区域在“自己主页”通常不存在。若要完整检查这些 DOM 依赖，请配置一个存在的外部账号：

```bash
XHUNT_E2E_TARGET_PROFILE_HANDLE='some_existing_handle' pnpm test:e2e
```

如果不配置，相关依赖会标记为 skipped，不会导致整套 DOM 依赖检查失败。

## 推荐执行顺序

直接执行：

```bash
pnpm test:e2e
```

`pnpm test:e2e` 会先执行 `pretest:e2e`：如果没有检测到 `http://127.0.0.1:9322` 的专用 Chrome，会自动打开 `tests/.auth/xcom-reader-profile`；随后会停下来提示你确认 x.com 已登录、Chrome 已安装或 Load unpacked 最新 XHunt 包。确认后按 Enter 才会开始 Playwright 测试。

如果只想单独打开登录用浏览器，也可以运行：

```bash
pnpm test:e2e:auth
```

完整 E2E 会包含 DOM 依赖检查、插件注入、面板、设置、主题、语言、真实 API、真实写入等用例。DOM 依赖检查会在真实 x.com 页签里慢速切换页面，默认每次切换等待 5 秒。若要调整频率，可设置 `XHUNT_E2E_NAV_DELAY_MS=8000`。如果 P0 依赖检查失败，先修 X DOM 适配，不要把它误判为插件功能失败。

## 常用命令

```bash
pnpm test:e2e
```

这个命令会跑完整 E2E，并在结束后生成中文 PDF 报告：

```text
tests/e2e/reports/latest/report.pdf
```

如果只想临时调试某个目录或单个用例，不再额外维护 package.json script，可直接使用 Playwright：

```bash
pnpm exec playwright test tests/e2e/panel
pnpm exec playwright test tests/e2e/smoke/injection.spec.ts
```

## 测试报告

项目额外生成中文 PDF 测试报告，并固定放在项目目录：

```text
tests/e2e/reports/latest/report.pdf
```

截图、接口响应 JSON、DOM 依赖检查文本等证据会内嵌到同一个 PDF 中，不再额外保留 HTML、Markdown 或 assets 目录。

每次执行 Playwright E2E 后都会刷新这个 PDF。可以直接打开 PDF。

中文报告包含：总数、通过/失败、耗时、用例中文说明、测试证据、真实 API 数据接口清单、截图、真实 API 响应 JSON、DOM 依赖检查详情、失败错误、trace 附件路径。

## 常见问题

### 1. `ProcessSingleton` / `SingletonLock` 报错

正常推荐路径不会再直接占用 profile，而是连接 `node script/open-xcom-auth-profile.mjs` 打开的 Chrome。若你设置了 `XHUNT_E2E_USE_CDP=false` 才会遇到这个错误，说明 `tests/.auth/xcom-reader-profile` 正在被 Chrome 使用。

如果确认没有任何 Chrome 窗口使用该 profile，可能是 Chrome 崩溃后遗留了锁文件，可以手动删除：

```bash
rm -f tests/.auth/xcom-reader-profile/SingletonLock   tests/.auth/xcom-reader-profile/SingletonSocket   tests/.auth/xcom-reader-profile/SingletonCookie
```

### 2. DOM 依赖检查里看不到 XHunt 插件

这是正常的。DOM 依赖检查只检查真实 x.com DOM，不加载插件；插件加载检查在完整 E2E 的插件用例中执行。

### 3. smoke 里插件 UI 找不到

确认当前加载的扩展 build 是最新的。测试不会自动运行 `yarn dev` / `yarn build`，如果改了源码里的 `data-xhunt-testid`，需要你手动生成新的扩展 build 后再跑 smoke。

### 4. 插件真实登录测什么

完整 E2E 里的插件登录用例现在走真实 XHunt Twitter OAuth 登录，不再用 fake user 模拟已登录态。流程是：

1. 清空插件本地 auth storage；
2. 确认插件未登录面板和 Login 按钮可见；
3. 点击真实 Login 按钮；
4. 等待 X OAuth 授权页打开，并自动点击授权按钮；
5. 等待 `x.com/settings/account/xhunt?code=...&state=...` callback；
6. 验证插件加密 storage 写入真实 `@xhunt/token` 和 `@xhunt/user`；
7. 验证面板展示当前真实 x.com 账号。

这条用例真实覆盖：

```text
GET /api/xhunt/auth/twitter/url
POST /api/xhunt/auth/twitter/callback
```

报告里会隐藏 token/code/state 明文，只展示是否写入成功和 callback URL 形态。

### 5. 真实 API 校验默认测哪个账号

完整 E2E 里的真实 API 校验当前测试的接口是：

```text
GET /api/xhunt/proxy/public/fetch/twitter/user
```

它通过已安装 XHunt 插件的 service worker 发起真实请求，并携带 XHunt v2 签名 headers。断言内容包括：HTTP 2xx、JSON 响应、`body.data.data` 非空、返回身份字段。

默认读取真实 `@xhunt_ai` 的用户数据，避免当前小号没有 XHunt KOL 数据导致接口返回 `data: null`。

如需指定其他真实账号：

```bash
XHUNT_E2E_API_PROFILE_HANDLE='some_handle' pnpm test:e2e
```

## 当前推荐运行方式

终端 1：

```bash
node script/open-xcom-auth-profile.mjs
```

在打开的普通 Chrome 里登录 x.com，并保持窗口打开。

终端 2：

```bash
pnpm test:e2e
```

测试默认连接：

```text
http://127.0.0.1:9322
```

如果需要换端口：

```bash
XHUNT_E2E_CDP_PORT=9333 node script/open-xcom-auth-profile.mjs
XHUNT_E2E_CDP_PORT=9333 pnpm test:e2e
```
