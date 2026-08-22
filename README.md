# deepseek-balance

A DeepSeek account balance readout plugin for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) Web GUI. Shows your current account **total balance** on the line below the composer, with a **peak-hour status dot** evaluated in Beijing time:

```
🟢/🔴 DeepSeek 余额: CNY 116.09 | 2 轮 · 161 步 | LLM 31m55s · ...
```

- 🔴 **Peak hours** — Beijing time 09:00–12:00 and 14:00–18:00 (half-open intervals: 12:00 and 18:00 sharp are off-peak)
- 🟢 **Off-peak hours** — everything else

The status dot always follows **Beijing time** (`Asia/Shanghai`), independent of the browser/OS timezone — the result is identical anywhere in the world.

## Quick start

> Before proceeding, make sure all [Prerequisites](#prerequisites) are satisfied (`dsh` CLI, `pnpm`, GitHub access, configured `DEEPSEEK_API_KEY`).

```sh
# 1. Install from GitHub (no npm account needed)
dsh plugin --profile web add "git+https://github.com/tianlinyan/deepseek-balance.git#v0.1.4"

# 2. Register the plugin — edit $DSH_HOME/profiles/web/cordis.patch.yml,
#    REPLACING the existing `[]` with:
#      - insert:
#          - id: deepseek-balance
#            name: 'deepseek-balance'

# 3. Refresh the browser page (no restart needed — the patch layer hot-reloads)
```

## Table of contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Uninstall](#uninstall)
- [Development](#development)
- [License](#license)

## Features

- **Total balance only** (`total_balance`) on a single compact line
- **Auto-refresh every 60 seconds** — nothing to click
- **Peak-hour status dot** following the official DeepSeek peak-pricing windows ([announcement](https://www.ithome.com/0/989/418.htm))
- **Tooltip on hover** tells you whether it is currently peak or off-peak
- **Zero build steps** — host half uses the Gateway SRC fallback (no generated Typert artifact); browser half is a hand-written bundle

## Prerequisites

All four must be true before installing:

| # | Prerequisite | How to check / fix |
|---|---|---|
| 1 | `dsh` CLI is runnable | `dsh --help` works. `dsh` is **not** a global npm package — it may live under an `npx` cache (e.g. `%LOCALAPPDATA%\npm-cache\_npx\<hash>\node_modules\.bin\dsh`). Add that `.bin` to `PATH`, or use `npx dsh ...`. |
| 2 | `pnpm` is installed | `pnpm --version` works. `dsh plugin` calls `pnpm` internally. Install with `npm install -g pnpm` (`corepack enable` may fail with `EPERM` under an nvm-managed Node). |
| 3 | GitHub is reachable | Install clones `git+https://github.com/...`. Restricted/sandboxed networks that block HTTPS will fail. |
| 4 | `DEEPSEEK_API_KEY` is configured | See [Configuration](#configuration). The key must exist **before** launching `dsh web` and survive a restart. |

## Installation

### Option 1: `dsh plugin` from GitHub (recommended)

The package is a git dependency — no npm account or publish needed:

```sh
# Pin a released tag (recommended)
dsh plugin --profile web add "git+https://github.com/tianlinyan/deepseek-balance.git#v0.1.4"

# Or track the latest main branch
dsh plugin --profile web add "git+https://github.com/tianlinyan/deepseek-balance.git"
```

Then [register the plugin](#register-the-plugin). The `peerDependencies` warning printed during install is expected: `react` and the `@deepseek-ai/*` packages come from the host DSH runtime.

### Option 2: Manual link

Link this package into the web profile's node_modules:

```powershell
New-Item -ItemType Junction -Path "$HOME\.dsh\profiles\web\node_modules\deepseek-balance" -Target "<path-to-this-package>"
```

Then [register the plugin](#register-the-plugin) as in Option 1.

### Register the plugin

Applies to both install options. Add the plugin to the profile's patch layer. **Do not append**: a fresh `cordis.patch.yml` contains a single `[]` line, and appending a second YAML list after it is a syntax error. **Replace the `[]`** with:

```yaml
# $DSH_HOME/profiles/web/cordis.patch.yml — replace the existing `[]` with this
- insert:
    - id: deepseek-balance
      name: 'deepseek-balance'
```

Refresh the browser page — the patch layer hot-reloads, no restart needed.

### Upgrading

- **Tag-pinned** install — re-add with the new tag (the spec must change for pnpm to fetch a different version), e.g. bump `#v0.1.1` to `#v0.1.4`:
  ```sh
  dsh plugin --profile web add "git+https://github.com/tianlinyan/deepseek-balance.git#v0.1.4"
  ```
- **Branch-tracking** install (no `#tag`) — `dsh plugin --profile web update deepseek-balance` pulls the latest.

## Configuration

### Required: `DEEPSEEK_API_KEY`

The plugin **requires** the `DEEPSEEK_API_KEY` credential, resolved through `ctx.credentials` on every request (the same seam your chat models use), so a key change takes effect within 60 seconds. Without it the plugin shows `api-key-not-configured`.

Set it as a **persistent** environment variable so it survives a `dsh web` restart:

**Windows (user-level, recommended):**

```powershell
setx DEEPSEEK_API_KEY "sk-xxxx"
# Then restart dsh web (and any open terminal) so the new variable takes effect
```

> Avoid `setx /M` (system-level): it is readable by every user and process on the machine. User-level is sufficient.

**macOS / Linux:**

```sh
# Add to ~/.zshrc or ~/.bashrc, then restart dsh web
export DEEPSEEK_API_KEY="sk-xxxx"
```

**Alternative — `$DSH_HOME/.credentials.yaml`** (written with user-only permissions):

```yaml
# $DSH_HOME/.credentials.yaml
DEEPSEEK_API_KEY: sk-xxxx
```

**Key security:** never commit the key into git, paste it into logs or screenshots, or share it in chat. If it is ever exposed publicly, revoke and regenerate it in the DeepSeek platform.

### Optional: `BALANCE_URL` proxy

Point the plugin at a proxy for the balance call by exporting `BALANCE_URL` as a **persistent** environment variable (same persistence rules as the API key above); it overrides the built-in `https://api.deepseek.com/user/balance` per request, so a change takes effect without restarting `dsh web`:

```powershell
setx BALANCE_URL "https://your-proxy.example/user/balance"
```

> Editing `BALANCE_URL` directly in `lib/index.js` still works, but is lost on a `dsh plugin` reinstall — prefer the environment variable.

## Verification

1. **UI** — refresh your DSH web GUI. Success = a `🟢/🔴 DeepSeek 余额: CNY xxx` line under the composer input.
2. **Endpoint** (optional, host half only):

   ```powershell
   Invoke-WebRequest -Uri "http://127.0.0.1:3080/api/deepseekBalance/get" -Method Post `
     -Body '{"type":"client-request","rpcId":"t","method":"deepseekBalance/get","payload":{"args":{}}}' `
     -ContentType "application/json" -UseBasicParsing
   ```

   A response with `"ok":true` and a `balance_infos` array means the Host half is working.

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `api-key-not-configured` shown | `DEEPSEEK_API_KEY` missing in the `dsh web` process environment. Configure it persistently (see [Configuration](#configuration)) and **restart** `dsh web`. |
| Balance line never appears | Plugin not registered — check `cordis.patch.yml` (must be the `- insert:` block, not an append after `[]`), then refresh. |
| `'pnpm' is not recognized` | pnpm missing — `npm install -g pnpm` (see [Prerequisites](#prerequisites)). |
| Install fails with network errors | GitHub unreachable from this machine (HTTPS blocked). |
| Stale balance after a key change | The plugin re-resolves the credential every 60 seconds; if it still fails, restart `dsh web`. |

## Uninstall

**Git-dependency install** — remove the dependency, then drop the patch entry:

```sh
# 1. Remove the dependency (clears package.json declaration + node_modules)
dsh plugin --profile web remove deepseek-balance

# 2. Remove the `- insert:` block for id: deepseek-balance from cordis.patch.yml

# 3. Refresh the browser page
```

**Manual-link install** — remove the entry from `cordis.patch.yml` and delete the link:

```powershell
Remove-Item "$HOME\.dsh\profiles\web\node_modules\deepseek-balance" -Recurse -Force
```

## Development

```sh
npm run check          # syntax check
npm test               # syntax check + regression/consistency tests (no deps)
npm pack --dry-run     # preview package contents
```

The tests in `test/` run with Node's built-in test runner (`node --test`) and need **no installed dependencies** — they guard the LICENSE encoding, the package/README/CHANGELOG version agreement, the client `loadBalance` signature, and the host/browser seams. CI runs `npm test` on push/PR (see `.github/workflows/ci.yml`).

### Releasing

This project is distributed as a **git dependency** (no npm publish):

```sh
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

Consumers then install with `dsh plugin --profile web add "git+https://github.com/tianlinyan/deepseek-balance.git#vX.Y.Z"`.

### Structure

```
deepseek-balance/
├── package.json          # dsh.client declaration + exports + peerDependencies
├── lib/
│   ├── index.js          # Host half: DeepSeekBalanceService (no build step)
│   ├── client.js         # Browser half: hand-written dock entry bundle
│   └── types/            # Type declarations
├── test/
│   └── health.test.mjs   # Dependency-free regression/consistency tests (node:test)
├── .github/workflows/ci.yml
├── CHANGELOG.md
├── LICENSE
└── README.md
```

### Notes

- **Peer dependencies** (`react`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-credentials`, `@deepseek-ai/dsh-typert-protocol`) are provided by the host DSH runtime — do not bundle them into the published artifact.
- The **endpoint namespace** is fixed at `deepseekBalance`; to change it, update `super(ctx, 'deepseekBalance')` in `lib/index.js` and the endpoint string in the client bundle together.
- Plain JavaScript, no build step; `lib/types/*.d.ts` is provided for TypeScript consumers.

## License

[MIT](LICENSE)
