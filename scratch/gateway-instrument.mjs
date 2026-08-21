/**
 * Scratch smoke test 5: instrument the REAL gateway to see srcClaims content.
 */
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join('C:/Users/tly00/.dsh/profiles/node_modules', 'x.js'))

const { Context, Service } = require('@deepseek-ai/cordis')
const { TypertRegistry } = require('@deepseek-ai/dsh-typert-registry')
const { TypertGatewayService } = require('@deepseek-ai/dsh-api-gateway')

const plugin = await import(pathToFileURL(path.join(__dirname, '..', 'lib', 'index.js')).href)
const { DeepSeekBalanceService } = plugin

class FakeConnectionService extends Service {
  constructor(ctx) { super(ctx, 'connection') }
  get rpc() {
    const owner = this.ctx
    return {
      intercept: (channel, matches, handler, options) =>
        owner.effect(() => {
          this.channel = channel
          this.authority = options.authority
          this.matches = matches
          this.handler = handler
          return () => {}
        }),
    }
  }
}

class FakeCredentials extends Service {
  constructor(ctx) { super(ctx, 'credentials') }
  async resolve() { return undefined }
}

const ctx = new Context()
ctx.provide('webServer', { routes() { return [] } })
await ctx.plugin(TypertRegistry)
await ctx.plugin(FakeConnectionService)
const gatewayFiber = ctx.plugin(TypertGatewayService)
await gatewayFiber
await ctx.plugin(FakeCredentials)
await ctx.plugin(DeepSeekBalanceService)

const connection = ctx.get('connection')
const gateway = ctx.get('typertGateway')

console.log('=== reflect.props services ===')
for (const [k, d] of Object.entries(ctx.reflect.props)) {
  if (d.type === 'service') console.log('service:', k)
}

// Force the claim check.
const claimed = connection.matches('deepseekBalance/get')
console.log('claimed via matches:', claimed)
// Peek at the private cache after the fact.
console.log('srcClaims:', gateway.srcClaims ? [...gateway.srcClaims] : gateway.srcClaims)

await ctx.fiber.dispose()
