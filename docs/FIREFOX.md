# Firefox 社区移植版

本 fork 来源于 https://github.com/AlphaHunt3/tweet-hunt-extension，保留上游作者与源码。它是社区移植，未经 XHunt 官方背书。

## 构建

- 桌面 Firefox 142 或更新版本。
- Node.js 22.18+（22 LTS）或 24 LTS；本次使用 Node.js 22.23.2 验证。Node.js 25 下观察到 `web-ext lint` 无输出提前结束，未将其列为支持环境。
- 使用仓库固定的 pnpm 10.11.0 和 `pnpm-lock.yaml`。

```bash
git clone https://github.com/JinSooo/tweet-hunt-extension.git
cd tweet-hunt-extension
corepack pnpm install --frozen-lockfile
corepack pnpm test:unit
corepack pnpm package:firefox
```

`package:firefox` 依次运行 Plasmo Firefox MV3 生产构建、Mozilla `web-ext lint` 和打包。构建不需要私有 `.env.pro`。产物为：

- `build/firefox-mv3-prod/`：可临时载入的扩展目录。
- `build/firefox-artifacts/xhunt_community_firefox_port-0.4.1.zip`：未签名扩展包。

不要只在 `package.json` 添加 `engines.node`：当前 Parcel 会据此推断 Node 目标并排除浏览器依赖。Node 版本要求保留在本文档。

Plasmo 的最终 Firefox manifest 使用 `background.scripts`。源码沿用 Firefox 支持的 `chrome.*` API；消息来源校验根据 `runtime.getURL('/')` 识别 Firefox 安装 UUID，不把它当作扩展 ID。Firefox 更新提示指向本 fork 的 Releases 页面。

## 安装和使用

1. 打开 `about:debugging#/runtime/this-firefox`。
2. 点击“临时载入附加组件”，选择构建目录中的 `manifest.json`，也可选择上面的 ZIP。
3. 访问 `https://x.com`。Firefox 若提示站点访问权限，允许扩展访问该站点。
4. 完成领域和头像样式选择。点击工具栏扩展图标可打开页面内设置。

临时扩展在 Firefox 重启后移除；开发时修改源码、重新构建，再在调试页点击“重新载入”。本版本没有在 Mozilla Add-ons 上架，也没有 Mozilla 签名。Firefox Release/Beta 的永久安装需要先通过 Mozilla 签名；把 ZIP 改名为 XPI 并不能获得签名。

## 功能范围

公开源码保留了页面注入、领域选择、主题/语言/显示设置和本地存储等前端逻辑。信息流净化等页面功能沿用上游实现，其效果取决于 X 的 DOM，不保证未来页面改版后继续兼容。

上游的 API transport、后台实时服务和远程配置是空实现，另有服务模块、营销配置及页面 initial-state hook 未公开。此 fork 补齐缺失的导出以便构建：服务调用明确拒绝并提示不可用，营销组件不展示，私有页面 hook 留空。没有恢复或猜测私有接口，也没有模拟 AI、登录、笔记或云端写入成功。

因此，登录、AI 分析、在线评分/笔记、榜单、热门趋势、云同步和商业活动等依赖后端的功能不可用。若要恢复，需要原作者授权提供完整接口、签名和相关模块，并重新验证 Firefox 后台请求权限与数据声明。

当前 manifest 仅请求 `storage`、`idle` 和 `https://x.com/*` 站点访问权限。数据收集声明为 `none`，依据是本公开版不包含实际业务 API 传输；该声明不能直接用于接回后端后的版本。

## 验证边界

`test:unit` 覆盖 Chrome/Firefox 扩展来源、错误扩展 ID、相似域名/不安全协议的拒绝，以及 Firefox 更新入口。`package:firefox` 验证真实生产产物和 ZIP。

真实浏览器检查使用 Python 标准库与独立 Firefox/Geckodriver，不读取日常浏览器配置或登录态，也不执行云端写入：

```bash
FIREFOX_BINARY=/path/to/firefox GECKODRIVER_BINARY=/path/to/geckodriver \
  python3 tests/firefox/smoke.py
```

脚本在临时 profile 中安装 ZIP，检查后台通信、来源校验、X 源下隔离 DOM 的页面注入、首次设置及语言保存，并输出 `build/firefox-smoke.png`。它先载入真实 `https://x.com` 触发 manifest 注入，再替换测试配置中的登录页 DOM 为最小 fixture，不覆盖真实登录账户场景；退出时清理 profile。依赖未打入包的坏版本已用于确认该检查会失败。

Mozilla lint 有 8 条既有打包代码警告：React/D3 的 `innerHTML`、依赖中的全局对象 `Function('return this')` 回退，以及上游 HTML sanitizer/徽章渲染。它们保留在校验输出中，尚未取得 AMO 审核结论；没有放宽 CSP 或隐藏这些警告。真实 X 页面还会阻止上游远程 `xhunt_new.jpg` 图片；冒烟测试将这类图片 CSP 警告单列，不视为扩展 JavaScript 逻辑错误。

上游公开类型使用大量 `any` 占位，`tsc --noEmit` 仍有既有类型错误；生产构建通过不代表全量 TypeScript 检查通过。原有 Chromium E2E 依赖登录态和私有服务，不适合作为本公开版的后端验收。

上游 README 引用了 MIT，但当前仓库不含所引用的 LICENSE 文件。本 fork 不新增许可证或商业授权。

## 官方参考

- [Plasmo 构建目标](https://docs.plasmo.com/framework/workflows/build)
- [Mozilla 后台脚本](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
- [跨浏览器扩展 API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Build_a_cross_browser_extension)
- [Firefox 数据声明](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Mozilla 签名与分发](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)
