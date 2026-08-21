/**
 * Scratch smoke test 12: REAL boot() with a temp profile whose patch layer
 * inserts deepseek-balance. This reproduces the exact loader/include tree.
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'

const require = createRequire(path.join('C:/Users/tly00/.dsh/profiles/node_modules', 'x.js'))
const { boot } = require('@deepseek-ai/dsh-app-boot')

// Temp profile dir with root config + patch that inserts the plugin.
const dir = mkdtempSync(path.join(tmpdir(), 'dsb-boot-'))
const rootConfig = path.join(dir, 'cordis.yml')
writeFileSync(rootConfig, '[]\n')

// Patch layers that mount the pieces we need, mirroring dsh-base's rows.
const patches = [
  { insert: [
    { id: 'timer', name: '@deepseek-ai/cordis-plugin-timer' },
    { id: 'typert', name: '@deepseek-ai/dsh-typert-registry' },
    { id: 'typert-gateway', name: '@deepseek-ai/dsh-api-gateway' },
    { id: 'credentials', name: '@deepseek-ai/dsh-credentials-local' },
    { id: 'deepseek-balance', name: 'deepseek-balance' },
  ] },
]

// Provide a fake connection service (the gateway injects it to register the
// /api interceptor). In the real web profile, dsh-client-connection provides it.
class FakeConnection {
  constructor(ctx) { this.ctx = ctx }
  get rpc() {
    const owner = this.ctx
    return {
      intercept: (channel, matches, handler, options) =>
        owner.effect(() => {
          this.channel = channel
          this.matches = matches
          this.handler = handler
          return () => {}
        }),
    }
  }
}

let claimResult = 'not-tested'
const ctx = await boot('test', rootConfig, patches, async (hostCtx) => {
  hostCtx.provide('connection', new FakeConnection(hostCtx))
})

const loader = ctx.get('loader')
for (const entry of loader.entries()) {
  console.log(`${entry.id} -> ${entry.options.name}  fiber=${entry.fiber?.state}  ${entry.fiber?.error?.message ?? ''}`)
}

// Give the include a tick to let the gateway's inject land, then probe claims.
await new Promise((resolve) => setTimeout(resolve, 100))
const connection = ctx.get('connection')
console.log('connection.matches defined:', typeof connection?.matches)
if (connection?.matches) {
  console.log('claim deepseekBalance/get:', connection.matches('deepseekBalance/get'))
  claimResult = String(connection.matches('deepseekBalance/get'))
}

await ctx.fiber.dispose()
console.log('CLAIM_RESULT=' + claimResult)
process.exit(0)
