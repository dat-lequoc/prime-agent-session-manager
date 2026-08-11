# Prime Agent Session Manager

<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Prime Agent Session Manager" />
</p>

<p align="center">
  <strong>Prime Agent 与多种 Coding Agent 会话的本地优先管理中心。</strong>
</p>

<p align="center">
  完整查看 Prime Agent trace、RLM、持久化 IPython 状态、工具调用、thinking、分支、token 使用量与 benchmark 运行。
</p>

> [!IMPORTANT]
> Prime Agent Session Manager 是
> [Pi Session Manager](https://github.com/Dwsy/pi-session-manager) 的 MIT 私有分支。
> 原始架构、产品基础和上游实现继续归功于
> [Dwsy](https://github.com/Dwsy) 与上游贡献者。完整来源见 [NOTICE.md](NOTICE.md)。

<p align="center">
  <a href="https://sessions.178.104.6.186.sslip.io/#/projects">在线 Session Manager</a> ·
  <a href="https://arena.178.104.6.186.sslip.io">Agent Harness Arena</a> ·
  <a href="https://github.com/dat-lequoc/prime-agent-session-manager">源码</a> ·
  <a href="https://github.com/Dwsy/pi-session-manager">上游项目</a> ·
  <a href="README.md">English</a>
</p>

## 界面预览

| Prime 会话检查 | Agent Harness Arena |
|---|---|
| ![Prime Agent 会话、Harness 筛选器、RLM runtime、IPython 状态、工具与 thinking](https://github.com/user-attachments/assets/33c86959-e9db-49e7-9a69-62f162ffcb90) | ![支持一键检查会话的 Agent Harness Arena benchmark](https://github.com/user-attachments/assets/068a4d8a-15f6-410f-acca-402d0c0ff51d) |

## 本分支的重点

- 自动发现 `~/.prime/agent/sessions` 与 `~/.prime/agent/session-artifacts`。
- 专门展示 Prime Agent 的 RLM/refinement、持久化 IPython、工具结果、thinking、token 与会话元数据。
- 首页项目搜索框旁提供 Harness 筛选器；默认仅选择 Prime Agent，也可勾选 Pi、Codex、Claude Code、OMP、OpenCode、Gemini CLI 等来源。
- 通过 `/#/open/<native-session-id>` 从 Agent Harness Arena 一键打开原生会话。
- `PSM_READ_ONLY=1` 只读部署模式会禁止终端、删除、设置写入、插件文件系统与模型调用，同时保留浏览和搜索能力。

## 在线访问

| 页面 | 地址 | 用途 |
|---|---|---|
| Session Manager | [sessions.178.104.6.186.sslip.io](https://sessions.178.104.6.186.sslip.io/#/projects) | 浏览 Prime 会话，并按需启用其他 Harness。 |
| Agent Harness Arena | [arena.178.104.6.186.sslip.io](https://arena.178.104.6.186.sslip.io) | 比较 benchmark，并一键打开原生 trace。 |
| Prime 示例会话 | [打开会话](https://sessions.178.104.6.186.sslip.io/#/open/019fef29-0f05-7710-b356-aef344d972a2) | 直接查看 Prime 专属渲染。 |

线上 Session Manager 为只读部署。健康检查地址：
`https://sessions.178.104.6.186.sslip.io/health`。

## 安装

此仓库为私有仓库。克隆源码或下载 Release 前，请先登录 GitHub CLI：

```bash
gh auth status
```

本分支目前还没有独立 Release。当前可用的安装方式是下面的源码构建；已认证的 Release 安装器会在本分支首次发布后启用，并且不会再静默下载上游构建。

### 从源码构建 CLI / Headless Server

需要 Node.js 22、pnpm、Rust 1.97+，并且 GitHub CLI 有权访问此仓库。

```bash
gh repo clone dat-lequoc/prime-agent-session-manager
cd prime-agent-session-manager
corepack enable
pnpm install --frozen-lockfile
pnpm run build:cli
./target/release/pi-session-cli
```

然后打开 [http://127.0.0.1:52131/#/projects](http://127.0.0.1:52131/#/projects)。

### 安装已发布的 CLI Release

安装器在检测到 GitHub CLI 登录状态后会使用 `gh release download`，因此支持私有仓库。

macOS / Linux：

```bash
gh api -H "Accept: application/vnd.github.raw+json" \
  repos/dat-lequoc/prime-agent-session-manager/contents/scripts/install-cli.sh | bash
```

Windows PowerShell：

```powershell
gh api -H "Accept: application/vnd.github.raw+json" `
  repos/dat-lequoc/prime-agent-session-manager/contents/scripts/install-cli.ps1 | iex
```

为了兼容现有自动化，安装后的可执行文件仍名为 `pi-session-cli`。

### 桌面开发

```bash
pnpm install --frozen-lockfile
pnpm run tauri:dev
```

生产构建：

```bash
pnpm run tauri:build
```

## 运行模式

| 模式 | 命令 | 地址 |
|---|---|---|
| 仅前端 | `pnpm run dev` | `http://127.0.0.1:1420` |
| 桌面应用 | `pnpm run tauri:dev` | Tauri 窗口 + Vite HMR |
| CLI 开发 | `pnpm run cli:dev` | Vite `1420`，后端 `52131` |
| Headless Server | `./target/release/pi-session-cli` | `http://127.0.0.1:52131` |
| 只读 Server | `PSM_READ_ONLY=1 ./target/release/pi-session-cli` | `http://127.0.0.1:52131` |

CLI 从 `~/.pi/pi-session-manager/config.json` 的 server 配置读取绑定地址、端口和认证设置。默认 HTTP 端口为 `52131`。服务对其他机器开放时必须保留认证并使用 TLS 反向代理。

## 路由与 Arena 集成

| 路由 | 说明 |
|---|---|
| `/#/projects` | 项目首页与可见 Harness 筛选器。 |
| `/#/projects/<project-path>` | 项目会话列表。 |
| `/#/sessions/<session-id>` | 已索引会话详情。 |
| `/#/open/<native-session-id>` | Arena 使用的原生会话入口。 |
| `/#/dashboard` | 跨会话统计。 |

Arena 仅暂存可检查的会话资产，并将每次 benchmark 运行链接到原生 session ID。生产 Session Manager 使用 `PSM_READ_ONLY=1`，不会启动终端、删除会话或修改 benchmark 数据。

## 核心能力

- List、Project、Tree、Dashboard 与 Kanban 多种浏览方式。
- 全文搜索、消息高亮、label 与来源筛选。
- 会话分支、compaction context、工具调用、trace、模型、token、费用与活动热力图。
- 非只读模式下继续支持原生 Agent resume 工作流。
- HTTP/WebSocket API、导出与浏览器插件扩展。

Prime Agent 是本分支的默认来源，同时保留 Pi、OMP、Claude Code、Codex、OpenCode、Gemini CLI、Cursor、Antigravity 等上游 provider 的兼容能力。

## 开发验证

```bash
pnpm run build
pnpm exec vitest run
pnpm run build:cli
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

更多文档：

- [Agent 指南](AGENTS.md)
- [开发指南](agent-docs/04-development.md)
- [扩展概览](extensions/README.md)
- [Plugin SDK](docs/PSM_PLUGIN_SDK.md)

## 许可与署名

本项目使用 MIT License。分支可以修改与重新品牌化，但必须保留许可证声明与上游署名。详见 [LICENSE](LICENSE) 与 [NOTICE.md](NOTICE.md)。

## macOS Gatekeeper

本地构建或未签名应用可能需要移除 quarantine：

```bash
sudo xattr -rd com.apple.quarantine "/Applications/Prime Agent Session Manager.app"
```
