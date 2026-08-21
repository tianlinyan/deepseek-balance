/**
 * Scratch smoke test 6: simulate HMR timing — gateway boots and claims are
 * computed BEFORE deepseek-balance mounts; then the plugin mounts later.
 * This mirrors the live server: patch layer hot-applies the plugin after boot.
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
await ctx.plugin(TypertGatewayService)

const connection = ctx.get('connection')
const gateway = ctx.get('typertGateway')

// First claim check BEFORE the plugin exists — mirrors the server boot.
console.log('pre-mount claim:', connection.matches('deepseekBalance/get'))
console.log('pre-mount srcClaims:', gateway.srcClaims ? [...gateway.srcClaims] : gateway.srcClaims)

// Now the plugin mounts (HMR patch applied).
await ctx.plugin(FakeCredentials)
await ctx.plugin(DeepSeekBalanceService)

console.log('post-mount claim:', connection.matches('deepseekBalance/get'))
console.log('post-mount srcClaims:', gateway.srcClaims ? [...gateway.srcClaims] : gateway.srcClaims)

await ctx.fiber.dispose()
