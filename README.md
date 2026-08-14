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

## Installation

### Option 1: `dsh plugin` (recommended)

Run from your DSH installation:

```sh
dsh plugin --profile web add deepseek-balance
```

Then append to `$DSH_HOME/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: deepseek-balance
      name: 'deepseek-balance'
```

Refresh the browser page to activate.

### Option 2: Manual link

Link this package into the web profile's node_modules:

```powershell
New-Item -ItemType Junction -Path "$HOME\.dsh\profiles\web\node_modules\deepseek-balance" -Target "<path-to-this-package>"
```

Then add the `cordis.patch.yml` entry as in Option 1.

## Configuration

- **API key**: shares the `DEEPSEEK_API_KEY` credential with your chat models (configured via the Models page or an environment variable) — no separate setup needed. The Host half resolves it live through `ctx.credentials` on every request, so a key change takes effect within 60 seconds.
- Optional: replace `BALANCE_URL` in `lib/index.js` with a proxy address.

## Uninstall

1. Remove the `deepseek-balance` entry appended to `cordis.patch.yml`;
2. Remove the node_modules link:
   ```powershell
   Remove-Item "$HOME\.dsh\profiles\web\node_modules\deepseek-balance" -Recurse -Force
   ```
3. Refresh the browser page.

## Development

```sh
# Syntax check
npm run check

# Preview the package (without publishing)
npm pack --dry-run

# Publish (requires `npm login` first; the package name must be available on the registry)
npm publish
```

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
