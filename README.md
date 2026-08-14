# deepseek-balance

A DeepSeek account balance readout plugin for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) Web GUI.

Shows your current DeepSeek account **total balance** in the dock area below the composer (message input), together with a **peak-hour status dot** (evaluated in Beijing time):

```
🟢/🔴 DeepSeek 余额: CNY 116.09 | 2 轮 · 161 步 | LLM 31m55s · ...
```

- 🔴 **Peak hours** (Beijing time 09:00–12:00 and 14:00–18:00, half-open intervals: 12:00 and 18:00 sharp are off-peak)
- 🟢 **Off-peak hours** (everything else)

The indicator is always evaluated in **Beijing time** (`Asia/Shanghai`) and is independent of the browser/OS timezone — the result is identical no matter where you are.

## Features

- Shows only the **total balance** (`total_balance`) on a single compact line
- Auto-refreshes every **60 seconds** — no manual action needed
- Status dot follows the peak-pricing windows from the official DeepSeek announcement ([DeepSeek API peak/off-peak pricing](https://www.ithome.com/0/989/418.htm))
- Tooltip on hover tells you whether it is currently peak or off-peak
- Host half uses the Gateway **SRC fallback** (no generated Typert artifact); browser half is a hand-written bundle — **zero build steps**

## Prerequisites

Before installing, make sure **all** of these are true:

| # | Prerequisite | How to check / fix |
|---|---|---|
| 1 | **`dsh` CLI is runnable** | `dsh --help` works in your terminal. `dsh` is **not** a global npm package — it may live under an `npx` cache (e.g. `%LOCALAPPDATA%\npm-cache\_npx\<hash>\node_modules\.bin\dsh`). Add that `.bin` to `PATH`, or run the full path / use `npx dsh ...` instead. |
| 2 | **`pnpm` is installed** | `pnpm --version` works. `dsh plugin` calls `pnpm` internally; without it you get `'pnpm' is not recognized`. Install with `npm install -g pnpm` (note: `corepack enable` may fail with `EPERM` under an nvm-managed Node). |
| 3 | **GitHub is reachable** | The install clones `git+https://github.com/...`. Restricted/sandboxed networks that block HTTPS will fail every step. |
| 4 | **`DEEPSEEK_API_KEY` is configured** | See [Configuration](#configuration) — the plugin needs it at runtime, and it must survive a `dsh web` restart. |

## Installation

### Option 1: `dsh plugin` from GitHub (recommended)

The package is distributed as a git dependency — no npm account or publish needed:

```sh
# Pin a released tag (recommended)
dsh plugin --profile web add "git+https://github.com/tianlinyan/deepseek-balance.git#v0.1.0"

# Or track the latest main branch
dsh plugin --profile web add "git+https://github.com/tianlinyan/deepseek-balance.git"
```

Then register the plugin in the profile's patch layer. **Do not append to the file**: a fresh `cordis.patch.yml` contains a single `[]` line, and appending a second YAML list after it is a syntax error. **Replace the `[]`** with the `- insert:` block:

```yaml
# $DSH_HOME/profiles/web/cordis.patch.yml
# (replace the existing `[]` with this — not append)
- insert:
    - id: deepseek-balance
      name: 'deepseek-balance'
```

Refresh the browser page to activate. No restart needed — the profile patch layer hot-reloads.

> The `peerDependencies` warning printed during install is expected: `react` and the `@deepseek-ai/*` packages are provided by the host DSH runtime and do not need to be installed into the profile.

To upgrade a **tag-pinned** install, re-add with the new tag (the spec must change for pnpm to fetch a different version):

```sh
dsh plugin --profile web add "git+https://github.com/tianlinyan/deepseek-balance.git#v0.1.1"
```

For a **branch-tracking** install (no `#tag`), `dsh plugin --profile web update deepseek-balance` pulls the latest.

### Option 2: Manual link

Link this package into the web profile's node_modules:

```powershell
New-Item -ItemType Junction -Path "$HOME\.dsh\profiles\web\node_modules\deepseek-balance" -Target "<path-to-this-package>"
```

Then set the `cordis.patch.yml` entry as in Option 1 (replace `[]`).

## Configuration

### Required: `DEEPSEEK_API_KEY` environment variable

The plugin **requires** the `DEEPSEEK_API_KEY` environment variable. It is read through `ctx.credentials` on every request — the same seam your chat models use — so a key change takes effect within 60 seconds. Without it, the plugin shows `api-key-not-configured`.

Set it as a **persistent** environment variable so it survives a `dsh web` restart:

**Windows (user-level, recommended):**

```powershell
# Set for the current user (persists across restarts; avoid /M — system-level
# variables are readable by every user/process on the machine)
setx DEEPSEEK_API_KEY "sk-xxxx"

# Restart dsh web (and any open terminal) so the new variable takes effect
```

**macOS / Linux:**

```sh
# Add to your shell profile (~/.zshrc or ~/.bashrc), then restart dsh web
export DEEPSEEK_API_KEY="sk-xxxx"
```

> ⚠️ **Pitfall 1 — temporary export**: if the key exists only in the shell that launched `dsh web` (a one-off `export`), the balance works until you restart the service, then shows `api-key-not-configured`. Use a persistent variable.
>
> ⚠️ **Pitfall 2 — key security**: prefer a **user-level** variable over a **system-level** one (`setx /M`), and never commit the key into git or paste it into logs/screenshots. If it is ever exposed publicly, revoke and regenerate it in the DeepSeek platform.

### Alternative: `$DSH_HOME/.credentials.yaml`

Instead of an environment variable, you may add the key to DSH's credential file (written with user-only permissions):

```yaml
# $DSH_HOME/.credentials.yaml
DEEPSEEK_API_KEY: sk-xxxx
```

Optional: replace `BALANCE_URL` in `lib/index.js` with a proxy address.

## Verification

Two self-checks (no need to ask anyone):

1. **UI**: open your DSH web GUI and refresh. Success = a `🟢/🔴 DeepSeek 余额: CNY xxx` line appears under the composer input.
2. **Endpoint** (optional, host half only):

   ```powershell
   Invoke-WebRequest -Uri "http://127.0.0.1:3080/api/deepseekBalance/get" -Method Post `
     -Body '{"type":"client-request","rpcId":"t","method":"deepseekBalance/get","payload":{"args":{}}}' `
     -ContentType "application/json" -UseBasicParsing
   ```

   A response with `"ok":true` and a `balance_infos` array means the Host half is working.

## Uninstall

For a git-dependency install, remove the dependency declaration and the installed files in one step, then drop the patch entry:

```sh
# 1. Remove the dependency (clears package.json declaration + node_modules)
dsh plugin --profile web remove deepseek-balance

# 2. Remove the patch entry from $DSH_HOME/profiles/web/cordis.patch.yml
#    (delete the `- insert:` block that adds id: deepseek-balance)

# 3. Refresh the browser page
```

For a manual-link install (Option 2), remove the entry from `cordis.patch.yml` and delete the link:

```powershell
Remove-Item "$HOME\.dsh\profiles\web\node_modules\deepseek-balance" -Recurse -Force
```

## Development

```sh
# Syntax check
npm run check

# Preview the package contents
npm pack --dry-run
```

### Releasing

This project is distributed as a **git dependency** (no npm publish):

1. Tag a release and push it (along with the `main` branch):
   ```sh
   git tag vX.Y.Z
   git push origin main
   git push origin vX.Y.Z
   ```
2. Consumers install via `dsh plugin --profile web add "git+https://github.com/tianlinyan/deepseek-balance.git#vX.Y.Z"`.

### Structure

```
deepseek-balance/
├── package.json          # dsh.client declaration + exports + peerDependencies
├── lib/
│   ├── index.js          # Host half: DeepSeekBalanceService (no build step)
│   ├── client.js         # Browser half: hand-written dock entry bundle
│   └── types/            # Type declarations
├── CHANGELOG.md
├── LICENSE
└── README.md
```

### Notes

- **Peer dependencies**: `react`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-credentials`, and `@deepseek-ai/dsh-typert-protocol` are provided by the host DSH runtime and declared as `peerDependencies` — do not bundle them into the published artifact.
- The **endpoint namespace** is fixed at `deepseekBalance`; if it collides with another plugin, change the key in `super(ctx, 'deepseekBalance')` in `lib/index.js` and update the endpoint string in the client bundle accordingly.
- This package is plain JavaScript with no build step; `lib/types/*.d.ts` is provided for TypeScript consumers.

## License

[MIT](LICENSE)
