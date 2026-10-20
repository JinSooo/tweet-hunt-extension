# Firefox 社区移植版

本 fork 来源于 [AlphaHunt3/tweet-hunt-extension](https://github.com/AlphaHunt3/tweet-hunt-extension)，是非官方社区移植，未经 XHunt 官方背书。

## 为什么之前没有数据

公开仓库将 API transport、请求签名、远程配置和部分业务模块留空。此前直接编译的 `xhunt_community_firefox_port-0.4.1.zip` 只能运行本地功能；榜单请求失败后，原界面仍显示“暂无数据”，头像排名则显示 `~`。它们不能证明服务器真的没有数据。

现在另提供从官方 Chrome 发布包在本地转换的 Firefox **诊断版，线上数据尚未验收通过**。固定版本为 **0.4.2**，来源是 Google Chrome 扩展更新服务，扩展 ID 为 `gonmfafjcdkngkbhcpmcphlgfhabkeji`。转换脚本只修改 manifest 与后台消息来源对 Firefox 扩展 URL 的识别，并移除 Chrome 专用更新地址和 `_metadata`；保留原客户端的业务代码、请求认证、登录和服务权限。

官方编译产物只保存在本机 `build/`，不提交到本 fork。本方式不恢复公开源码中缺失的私有业务源码，也不提供额外登录或订阅权限。

## 构建完整客户端

需要 Python 3、桌面 Firefox 142+，以及 Node.js 22.18+（22 LTS）或 24 LTS。已用 Node.js 22.23.2 验证；Node.js 25 下曾出现 `web-ext lint` 无输出提前退出。

```bash
git clone https://github.com/JinSooo/tweet-hunt-extension.git
cd tweet-hunt-extension
corepack pnpm install --frozen-lockfile
corepack pnpm test:unit
corepack pnpm package:firefox
```

产物：

- `build/firefox-official/`：完整客户端的 Firefox 目录。
- `build/firefox-artifacts/xhunt_official_firefox-0.4.2.zip`：未签名安装包。

`package:firefox` 先用 Python 标准库下载和转换，再运行 Mozilla `web-ext lint`。已下载官方 CRX 时，也可执行 `python3 scripts/package-firefox.py --crx /path/to/official.crx`；仍须通过相同校验。

官方输入 CRX 的 SHA256 固定为：

```text
96de11f12dcbb6464b8afde5b7df959d8b00b8095d7b7550eaf457dc16010067
```

校验不匹配、manifest 版本不符或消息来源补丁无法精确匹配时，转换会停止。官方商店更新后需要重新核对兼容性；不要为绕过错误直接替换哈希。

## 数据与权限

完整客户端会连接 `kb.xhunt.ai` 等官方服务，数据行为沿用官方 Chrome 版：

- 账号关联的请求可携带 X 用户名、用户 ID、登录凭据、语言和客户端版本。
- 查询与分析会提交相关 X 用户、页面链接和页面内容。
- 使用聊天、评论、备注功能时，会提交你输入的消息、历史、评论或备注。
- 活动注册功能包含邮箱和钱包地址等输入。

manifest 据此声明 `authenticationInfo`、`personallyIdentifyingInfo`、`websiteContent`、`browsingActivity`、`personalCommunications` 五类必需数据，不能沿用此前离线版的 `none`。仅添加 `storage`、`idle` 及 `https://x.com/*`、`https://kb.xhunt.ai/*` 访问权限，不放宽 CSP。

**Firefox 的 `about:debugging` 临时加载会自动授予安装时的权限与数据类别，不会显示普通安装的同意弹框。请在加载前了解上述行为。** 临时加载的测试不代表正常安装授权弹框已经验收。[Mozilla 临时安装权限说明](https://extensionworkshop.com/documentation/develop/test-permission-requests/) · [数据类别定义](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/#taxonomy)

## 安装

1. 打开 `about:debugging#/runtime/this-firefox`。
2. 点击“临时载入附加组件”，选择新的 `xhunt_official_firefox-0.4.2.zip`，或 `build/firefox-official/manifest.json`。如 Firefox 拒绝重复 ID，先移除旧临时版，再载入；旧临时版的设置可能需要重选。
3. 刷新已经打开的 `https://x.com` 页面，允许该站点访问权限，完成领域和头像样式选择。
4. 查看右侧榜单，点击头像或工具栏图标打开设置。

不要只对旧 `firefox-mv3-prod` 目录点击“重新载入”，那仍然是缺少请求层的公开源码构建。

临时扩展在 Firefox 重启后移除。本包没有 Mozilla 签名，也未在 Mozilla Add-ons 上架；Firefox Release/Beta 的永久安装需要 Mozilla 签名。把 ZIP 改名为 XPI 不会获得签名。[Mozilla 签名与分发说明](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)

## 公开源码开发版

需要修改 React/TypeScript 源码时使用：

```bash
corepack pnpm package:firefox:source
```

产物仍是 `build/firefox-mv3-prod/` 与 `xhunt_community_firefox_port-0.4.1.zip`。该模式补齐缺失模块的导出以便构建，但业务服务明确拒绝调用；登录、AI 分析、在线评分/笔记、榜单、云同步等不可用。`data_collection_permissions: none` 仅适用于这个没有实际业务传输的源码开发版。

不要只在 `package.json` 添加 `engines.node`：当前 Parcel 会据此推断 Node 目标并排除浏览器依赖。Node 版本要求保留在本文档。

## 验证范围

`test:unit` 包含 Chrome/Firefox 消息来源校验、更新入口，以及转换器的校验失败、上游结构变化、路径穿越拒绝和业务文件不变性检查。

完整客户端已重新从 Google 下载并通过固定哈希校验，Mozilla `web-ext lint` 为 0 错误、6 条原包 `innerHTML` 警告；尚未取得 AMO 审核结论。

2026-10-20 的独立访客测试尚未取得非空榜单。Firefox 的 GitHub/KOL/头像 rank 请求返回 HTTP 400，静态错误码为 `MISSING_SIGNATURE_HEADERS`；实际 HTTP 层的六项签名/身份相关头均非空，`x-user-id` 和 `authorization` 为空。响应未说明缺少哪一项，不能将错误码直接解释为 Firefox 丢失了签名。

官方 Chrome 业务代码在独立 Chrome for Testing 151 中，同 GitHub/KOL 接口 GET 返回 HTTP 403，OPTIONS 204，没有浏览器 CORS 失败。对照测试也通过 CRX 的公开验证 key 保留商店扩展 ID，运行时 ID 已核对一致，结果相同；未改动请求身份、Origin、UA 或签名。这仍是没有账号的测试，不能据此断言有正常登录凭据的官方 Chrome 版也不可用，也不能把 400 与 403 称为相同错误。

带 X 页面登录态的 Zen 157 场景亦未恢复榜单。只读检查确认初始状态可解析并匹配当前账号，且原客户端正常存储 getter 可解密读取账号与用户名；未导出实际账号或凭据。XHunt 自身登录凭据与最终业务数据仍未验收通过。

公开源码版的独立 Firefox 冒烟检查仍可执行：

```bash
FIREFOX_BINARY=/path/to/firefox GECKODRIVER_BINARY=/path/to/geckodriver \
  python3 tests/firefox/smoke.py
```

此脚本只检查源码版的临时安装、后台通信、隔离 X DOM 注入、本地设置与存储，不验收真实业务数据。使用独立临时 profile，不读取日常浏览器的账号；退出时清理 profile。源码生产构建通过不代表全量 `tsc --noEmit` 通过，上游类型仍有既有错误。

上游 README 引用了 MIT，但当前仓库不含所引用的 LICENSE 文件。本 fork 不新增许可证或商业授权，不在公开仓库重新分发官方 Chrome 编译产物。
