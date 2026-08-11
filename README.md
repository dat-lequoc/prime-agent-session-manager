# Prime Agent Session Manager

<p align="center">
  <img src="branding/prime-agent-mark.svg" width="128" height="128" alt="Prime Agent Session Manager" />
</p>

<p align="center">
  <strong>A local-first command center for Prime Agent and coding-agent sessions.</strong>
</p>

<p align="center">
  Inspect Prime Agent traces, RLM activity, persistent IPython state, tool calls,
  thinking, branches, token usage, and benchmark runs without flattening the
  details that make the session useful.
</p>

> [!IMPORTANT]
> Prime Agent Session Manager is an MIT-licensed private fork of
> [Pi Session Manager](https://github.com/Dwsy/pi-session-manager) by
> [Dwsy](https://github.com/Dwsy). The original architecture, product foundation,
> and upstream implementation remain credited to Dwsy and the upstream
> contributors. See [NOTICE.md](NOTICE.md) for full provenance.

<p align="center">
  <a href="https://sessions.178.104.6.186.sslip.io/#/projects">Live session manager</a> ·
  <a href="https://arena.178.104.6.186.sslip.io">Agent Harness Arena</a> ·
  <a href="https://github.com/dat-lequoc/prime-agent-session-manager">Source</a> ·
  <a href="https://github.com/Dwsy/pi-session-manager">Upstream</a> ·
  <a href="README.zh.md">中文</a>
</p>

## Preview

| Prime session inspection | Agent Harness Arena |
|---|---|
| ![Prime Agent session with the harness picker, RLM runtime, IPython state, tools, and thinking](https://github.com/user-attachments/assets/33c86959-e9db-49e7-9a69-62f162ffcb90) | ![Agent Harness Arena benchmark run with one-click session inspection](https://github.com/user-attachments/assets/068a4d8a-15f6-410f-acca-402d0c0ff51d) |

## What this fork adds

- First-class discovery of Prime Agent sessions in `~/.prime/agent/sessions` and artifacts in `~/.prime/agent/session-artifacts`.
- Prime-aware rendering for RLM/refinement activity, persistent IPython state, tool results, thinking, token usage, and session metadata.
- A front-page harness picker beside project search. Prime Agent is selected by default; Pi, Codex, Claude Code, OMP, OpenCode, Gemini CLI, and other sources can be added with checkboxes.
- Stable native-session links at `/#/open/<native-session-id>` for opening benchmark runs directly from Agent Harness Arena.
- A deployable read-only mode for shared inspection environments: `PSM_READ_ONLY=1` blocks terminal, deletion, settings mutation, plugin filesystem access, and model invocation while preserving session browsing and search.

## Open the deployed UI

| Surface | URL | Purpose |
|---|---|---|
| Session Manager | [sessions.178.104.6.186.sslip.io](https://sessions.178.104.6.186.sslip.io/#/projects) | Browse Prime sessions and optionally enable other harnesses. |
| Agent Harness Arena | [arena.178.104.6.186.sslip.io](https://arena.178.104.6.186.sslip.io) | Compare benchmark runs and open native session traces in one click. |
| Example Prime session | [Open session](https://sessions.178.104.6.186.sslip.io/#/open/019fef29-0f05-7710-b356-aef344d972a2) | See the Prime-specific session view directly. |

The hosted Session Manager is intentionally read-only. Its health endpoint is
available at `https://sessions.178.104.6.186.sslip.io/health`.

## Install

This repository is private. Use an authenticated GitHub CLI session for cloning
or downloading release assets:

```bash
gh auth status
```

No fork release is published yet. The source build below is the working install
path today; the authenticated release installer is ready for the first fork
release and will never silently download the upstream build.

### Build the CLI/headless server from source

Requirements: Node.js 22, pnpm, Rust 1.97+, and GitHub CLI access to this repo.

```bash
gh repo clone dat-lequoc/prime-agent-session-manager
cd prime-agent-session-manager
corepack enable
pnpm install --frozen-lockfile
pnpm run build:cli
./target/release/pi-session-cli
```

Then open [http://127.0.0.1:52131/#/projects](http://127.0.0.1:52131/#/projects).
The server embeds the production web UI and serves HTTP, WebSocket, and API
traffic on the same port.

### Install a published CLI release

The installer uses `gh release download` when GitHub CLI authentication is
available, which also works with this private repository.

macOS / Linux:

```bash
gh api -H "Accept: application/vnd.github.raw+json" \
  repos/dat-lequoc/prime-agent-session-manager/contents/scripts/install-cli.sh | bash
```

Windows PowerShell:

```powershell
gh api -H "Accept: application/vnd.github.raw+json" `
  repos/dat-lequoc/prime-agent-session-manager/contents/scripts/install-cli.ps1 | iex
```

The installed executable keeps the compatible name `pi-session-cli`. Installer
options include `--version`, `--prefix`, `--yes`, and `--no-verify`; run the
script with `--help` for the complete list.

### Desktop development

```bash
pnpm install --frozen-lockfile
pnpm run tauri:dev
```

Build production desktop bundles with:

```bash
pnpm run tauri:build
```

## Run modes

| Mode | Command | URL |
|---|---|---|
| Frontend only | `pnpm run dev` | `http://127.0.0.1:1420` |
| Desktop app | `pnpm run tauri:dev` | Tauri window with Vite HMR |
| CLI development | `pnpm run cli:dev` | Vite on `1420`, CLI backend on `52131` |
| Built headless server | `./target/release/pi-session-cli` | `http://127.0.0.1:52131` |
| Read-only headless server | `PSM_READ_ONLY=1 ./target/release/pi-session-cli` | `http://127.0.0.1:52131` |

The CLI reads its bind address, port, and authentication settings from the
server section of `~/.pi/pi-session-manager/config.json`. The default HTTP port
is `52131`. Keep authentication enabled whenever the service is reachable from
another machine, and place public deployments behind TLS.

## Routes and Arena integration

The web application uses hash routes so links work in both Tauri and the
embedded CLI server:

| Route | Description |
|---|---|
| `/#/projects` | Project dashboard and visible harness filter. |
| `/#/projects/<project-path>` | Project-scoped sessions. |
| `/#/sessions/<session-id>` | Indexed session detail. |
| `/#/open/<native-session-id>` | Native session lookup used by Agent Harness Arena. |
| `/#/dashboard` | Cross-session analytics. |

Arena stages only inspectable session artifacts and links a benchmark run to its
native session ID. The production manager runs with `PSM_READ_ONLY=1`, so a
one-click inspection cannot start terminals, delete sessions, or mutate the
staged benchmark data.

## Core capabilities

- Browse sessions by list, project, tree, dashboard, and Kanban views.
- Search across sessions and messages with full-text indexing, highlights, labels, and source filters.
- Inspect conversation branches, compaction context, tool calls, traces, model usage, token trends, cost, and activity heatmaps.
- Resume supported local sessions in their original agent workflow when running outside read-only mode.
- Export sessions and use the HTTP/WebSocket APIs for integrations.
- Extend the browser with built-in, npm, local-file, or development plugins.

Prime Agent is the default source for this fork, while compatibility is retained
for Pi, OMP, Claude Code, Codex, OpenCode, Gemini CLI, Cursor, Antigravity, and
other providers supported by the upstream session bridge.

## Development and validation

```bash
pnpm run build
pnpm exec vitest run
pnpm run build:cli
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Additional architecture and plugin documentation:

- [Agent guide](AGENTS.md)
- [Development guide](agent-docs/04-development.md)
- [Extension overview](extensions/README.md)
- [Plugin SDK](docs/PSM_PLUGIN_SDK.md)

## License and credit

Licensed under the MIT License. This fork may be modified and rebranded, but the
license notice and upstream attribution must be preserved. See [LICENSE](LICENSE)
and [NOTICE.md](NOTICE.md).

## macOS Gatekeeper note

For a locally built or unsigned app, macOS may require quarantine metadata to be
removed:

```bash
sudo xattr -rd com.apple.quarantine "/Applications/Prime Agent Session Manager.app"
```
