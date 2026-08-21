/**
 * Scratch smoke test 2: full gateway dispatch. Mirrors gateway.host.spec.ts:
 * real TypertRegistry + gateway + plugin service, then invoke through the
 * connection interceptor exactly like the browser RPC would.
 */
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join('C:/Users/tly00/.dsh/profiles/node_modules', 'x.js'))

const { Context, Service } = require('@deepseek-ai/cordis')
const { TypertRegistry } = require('@deepseek-ai/dsh-typert-registry')
const { TypertGatewayService } = require('@deepseek-ai/dsh-api-gateway')
const { Remote, TypertRemoteService } = require('@deepseek-ai/dsh-typert-protocol')

const plugin = await import(pathToFileURL(path.join(__dirname, '..', 'lib', 'index.js')).href)
const { DeepSeekBalanceService } = plugin

// Minimal fake connection service mirroring the gateway spec's FakeConnectionService.
class FakeConnectionService extends Service {
  constructor(ctx) {
    super(ctx, 'connection')
  }
  get rpc() {
    const owner = this.ctx
    return {
      intercept: (channel, matches, handler, options) =>
        owner.effect(() => {
          this.channel = channel
          this.authority = options.authority
          this.matches = matches
          this.handler = handler
          return () => {
            this.channel = undefined
            this.authority = undefined
            this.matches = undefined
            this.handler = undefined
          }
        }),
    }
  }
}

class FakeCredentials extends Service {
  async resolve() {
    return { value: 'sk-test', source: 'env' }
  }
}

globalThis.fetch = async (url, init) => {
  return {
    ok: true,
    status: 200,
    json: async () => ({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '116.09' }] }),
  }
}

const ctx = new Context()
ctx.provide('webServer', {
  routes() { return [] },
})
await ctx.plugin(TypertRegistry)
await ctx.plugin(FakeConnectionService)
await ctx.plugin(TypertGatewayService)
await ctx.plugin(FakeCredentials)
await ctx.plugin(DeepSeekBalanceService)

const connection = ctx.get('connection')
console.log('connection:', connection)

// Claim check — what the browser RPC matcher sees.
const claimed = connection.matches('deepseekBalance/get')
console.log('claim deepseekBalance/get:', claimed)

if (claimed) {
  const result = await connection.handler('deepseekBalance/get', { args: {} }, new AbortController().signal)
  console.log('dispatch result:', JSON.stringify(result))
}

await ctx.fiber.dispose()
console.log('=== gateway dispatch smoke OK ===')
