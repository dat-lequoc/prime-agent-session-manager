# Prime-Agent Session Manager

<p align="center">
  <img src="branding/prime-agent-mark.svg" width="128" height="128" alt="Prime-Agent Session Manager" />
</p>

<p align="center">
  <strong>Prime-Agent Web UI — inspect traces, recursive agents, and persistent IPython work locally.</strong>
</p>

<p align="center">
  <a href="https://github.com/dat-lequoc/prime-agent-session-manager">Source</a> ·
  <a href="https://github.com/dat-lequoc/prime-agent-session-manager/releases">Releases</a> ·
  <a href="https://github.com/Dwsy/pi-session-manager">Upstream</a> ·
  <a href="README.zh.md">中文</a>
</p>

## Install and run

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/dat-lequoc/prime-agent-session-manager/main/scripts/install-cli.sh | bash
pi-session-cli
```

Windows PowerShell:

```powershell
iwr -useb https://raw.githubusercontent.com/dat-lequoc/prime-agent-session-manager/main/scripts/install-cli.ps1 | iex
pi-session-cli
```

Open **[http://127.0.0.1:52131/#/projects](http://127.0.0.1:52131/#/projects)**. Prime-Agent sessions and projects are selected by default; use the source filter on the front page to include Pi, Codex, Claude Code, OpenCode, Gemini CLI, and other supported harnesses.

The installer downloads the latest release for your platform and installs the compatible `pi-session-cli` executable. Run the installer with `--help` for version, prefix, confirmation, and verification options.

## Screenshots

| Prime projects and session analytics | Prime trace with recursive agents |
|---|---|
| ![Light-theme dashboard filtered to Prime-Agent sessions](.github/screenshots/prime-dashboard-light.png) | ![Prime-Agent trace showing recursive agents, active goal, IPython state, and harness memory](.github/screenshots/prime-trace-light.png) |

| Persistent IPython execution | Runtime diagnostics and retained artifacts |
|---|---|
| ![Expanded persistent IPython call with Python source and output](.github/screenshots/prime-ipython-light.png) | ![Prime runtime diagnostics showing kernel variables, continual-harness state, and artifact references](.github/screenshots/prime-diagnostics-light.png) |

## Prime-Agent support

- Discovers Prime-Agent sessions in `~/.prime/agent/sessions` and runtime artifacts in `~/.prime/agent/session-artifacts`.
- Reconstructs recursive RLM child-agent activity with status, model, token usage, and drill-down transcripts.
- Renders persistent IPython calls as readable cells with source, stdout, results, errors, and retained kernel variables.
- Summarizes the active goal, harness memories, refinements, skills, specs, scheduled jobs, and artifact health.
- Preserves thinking, tool calls, conversation branches, compaction context, model usage, token statistics, cost, and project analytics.
- Defaults the visible source filter to Prime-Agent while retaining the upstream provider ecosystem.

## Run modes

| Mode | Command | URL |
|---|---|---|
| Installed local server | `pi-session-cli` | `http://127.0.0.1:52131` |
| Frontend development | `pnpm run dev` | `http://127.0.0.1:1420` |
| CLI development | `pnpm run cli:dev` | Frontend on `1420`, backend on `52131` |
| Desktop development | `pnpm run tauri:dev` | Tauri window with Vite HMR |
| Read-only local server | `PSM_READ_ONLY=1 pi-session-cli` | `http://127.0.0.1:52131` |

The CLI reads its bind address, port, authentication, and session settings from `~/.pi/pi-session-manager/config.json`. Keep authentication enabled and use TLS whenever you expose the server beyond your own machine.

## Useful routes

The web UI uses hash routes so the same links work in the desktop app and local server.

| Route | Description |
|---|---|
| `/#/projects` | Front page, project dashboard, and source filter |
| `/#/projects/<project-path>` | Sessions within one project |
| `/#/sessions/<session-id>` | Indexed session detail |
| `/#/open/<native-session-id>` | Resolve and open a session by its native ID |
| `/#/dashboard` | Cross-session analytics |

## Build from source

Requirements: Node.js 22+, pnpm, Rust 1.97+, and Git.

```bash
git clone https://github.com/dat-lequoc/prime-agent-session-manager.git
cd prime-agent-session-manager
corepack enable
pnpm install
pnpm run build:cli
./target/release/pi-session-cli
```

For the desktop application:

```bash
pnpm run tauri:dev
# or create production bundles
pnpm run tauri:build
```

## Development

```bash
pnpm run build
pnpm exec vitest run
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

More documentation:

- [Agent guide](AGENTS.md)
- [Development guide](agent-docs/04-development.md)
- [Extension overview](extensions/README.md)
- [Plugin SDK](docs/PSM_PLUGIN_SDK.md)

## License and upstream credit

Prime-Agent Session Manager is an MIT-licensed fork of [Pi Session Manager](https://github.com/Dwsy/pi-session-manager), created by [Dwsy](https://github.com/Dwsy). The original architecture, product foundation, and upstream implementation belong to Dwsy and the upstream contributors; their work made this project possible.

This fork adds the Prime-Agent integration and rebranded experience while preserving the MIT license and attribution. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).

## macOS Gatekeeper

Locally built or unsigned desktop bundles may require quarantine metadata to be removed:

```bash
sudo xattr -rd com.apple.quarantine "/Applications/Prime-Agent Session Manager.app"
```
