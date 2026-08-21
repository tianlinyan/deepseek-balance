/**
 * Scratch smoke test 10: real Loader + Include tree, patch-layer insert of the
 * plugin, exactly like the live web server. This is the definitive repro.
 */
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join('C:/Users/tly00/.dsh/profiles/node_modules', 'x.js'))

const { Context, Service } = require('@deepseek-ai/cordis')
const Loader = require('@deepseek-ai/cordis-plugin-loader')
const Include = require('@deepseek-ai/cordis-plugin-include')
const { TypertRegistry } = require('@deepseek-ai/dsh-typert-registry')
const { TypertGatewayService } = require('@deepseek-ai/dsh-api-gateway')

const ctx = new Context()
await ctx.plugin(Loader)
ctx.loader.tree.install('root', {
  type: 'tree',
  entries: [
    { id: 'registry', name: '@deepseek-ai/dsh-typert-registry' },
    { id: 'gateway', name: '@deepseek-ai/dsh-api-gateway' },
    { id: 'include', name: '@deepseek-ai/cordis-plugin-include', config: { patches: [
      { insert: [{ id: 'deepseek-balance', name: 'deepseek-balance' }] },
    ] } },
  ],
})
await ctx.loader.start()
await ctx.loader.await()

// Find the connection interceptor like the live server does.
// The gateway intercepts '/api' on ctx.connection. In this tree, connection
// service does not exist; the gateway waits for it. Provide it after boot to
// trigger the gateway's inject registration — mirroring the browser opening
// the /api channel.
class FakeConnection extends Service {
  constructor(c) { super(c, 'connection') }
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

console.log('entries:')
for (const e of ctx.loader.entries()) {
  console.log(' ', e.id, '->', e.options.name, 'fiber:', e.fiber?.state, e.fiber?.error?.message ?? '')
}

// Simulate the browser opening /api: provide connection late.
await ctx.plugin(FakeConnection)
await ctx.plugin(Include) // ensure include mounted before connection injects?

const conn = ctx.get('connection')
if (conn?.matches) {
  console.log('claim deepseekBalance/get:', conn.matches('deepseekBalance/get'))
} else {
  console.log('no connection interceptor found')
}

await ctx.fiber.dispose()
