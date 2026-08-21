/**
 * Scratch smoke test 13: real boot() with a config file placed INSIDE the
 * real web profile dir, so module resolution matches the live server exactly.
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { writeFileSync } from 'node:fs'

const require = createRequire(path.join('C:/Users/tly00/.dsh/profiles/node_modules', 'x.js'))
const { boot } = require('@deepseek-ai/dsh-app-boot')

const profileDir = 'C:/Users/tly00/.dsh/profiles/web'
const rootConfig = path.join(profileDir, 'scratch-cordis.yml')
writeFileSync(rootConfig, '[]\n')

const patches = [
  { insert: [
    { id: 'timer', name: '@deepseek-ai/cordis-plugin-timer' },
    { id: 'typert', name: '@deepseek-ai/dsh-typert-registry' },
    { id: 'typert-gateway', name: '@deepseek-ai/dsh-api-gateway' },
    { id: 'credentials', name: '@deepseek-ai/dsh-credentials-local' },
    { id: 'deepseek-balance', name: 'deepseek-balance' },
  ] },
]

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

const ctx = await boot('test', rootConfig, patches, async (hostCtx) => {
  hostCtx.provide('connection', new FakeConnection(hostCtx))
})

const loader = ctx.get('loader')
for (const entry of loader.entries()) {
  const err = entry.fiber?.error?.message ?? ''
  console.log(`${entry.id} -> ${entry.options.name}  fiber=${entry.fiber?.state}  ${err.slice(0, 120)}`)
}

await new Promise((resolve) => setTimeout(resolve, 200))
const connection = ctx.get('connection')
console.log('claim deepseekBalance/get:', connection?.matches?.('deepseekBalance/get'))

await ctx.fiber.dispose()
process.exit(0)
