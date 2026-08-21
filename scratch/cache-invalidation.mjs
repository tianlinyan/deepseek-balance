/**
 * Scratch smoke test 15: gateway computes srcClaims (empty) BEFORE the plugin
 * exists, then the plugin mounts via a sibling ctx. Does internal/service
 * invalidate the cached srcClaims?
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
class FakeCredentials extends Service {
  constructor(c) { super(c, 'credentials') }
  async resolve() { return undefined }
}

const ctx = new Context()
await ctx.plugin(TypertRegistry)
const gatewayFiber = ctx.plugin(TypertGatewayService)
await gatewayFiber
const connFiber = ctx.plugin(FakeConnection)
await connFiber

const conn = ctx.get('connection')
const gateway = ctx.get('typertGateway')

// 1) First claim check BEFORE the plugin exists -> caches empty srcClaims.
console.log('pre-claim (no plugin):', conn.matches('deepseekBalance/get'))
console.log('pre srcClaims:', gateway.srcClaims ? [...gateway.srcClaims] : gateway.srcClaims)

// 2) Now the plugin mounts.
await ctx.plugin(FakeCredentials)
const pluginFiber = ctx.plugin(DeepSeekBalanceService)
await pluginFiber

console.log('post srcClaims (after invalidate?):', gateway.srcClaims ? [...gateway.srcClaims] : gateway.srcClaims)
console.log('post-claim:', conn.matches('deepseekBalance/get'))

await ctx.fiber.dispose()
