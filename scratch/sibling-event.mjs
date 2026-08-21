/**
 * Scratch smoke test 14: does the gateway's ctx.on('internal/service') listener
 * fire when a SIBLING fiber (another entry in the same include) provides a new
 * service AFTER the gateway cached srcClaims?
 *
 * Mirrors: live server booted without the plugin -> gateway computes srcClaims
 * (empty) -> HMR adds deepseek-balance -> provide('deepseekBalance') fires
 * internal/service on the plugin's ctx.
 */
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join('C:/Users/tly00/.dsh/profiles/node_modules', 'x.js'))

const { Context, Service, symbols } = require('@deepseek-ai/cordis')
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
const rootCtx = ctx

// Mount the gateway under a "group" parent context, like the include creates.
// The include mounts each entry as a child fiber of the include's own ctx.
const groupCtx = rootCtx
const gatewayFiber = ctx.plugin(TypertRegistry)
await gatewayFiber

// Simulate: the gateway registers its internal/service listener on ITS OWN
// (include-child) context, not the root.
const gatewayCtx = groupCtx.extend()
const gatewayFiber2 = gatewayCtx.plugin(TypertGatewayService)
await gatewayFiber2

const connFiber = gatewayCtx.plugin(FakeConnection)
await connFiber

const gateway = gatewayCtx.get('typertGateway')
console.log('gateway.ctx === groupCtx:', gateway.ctx === groupCtx)

// Plugin mounts as ANOTHER child fiber of the same group ctx.
const credFiber = groupCtx.plugin(FakeCredentials)
await credFiber
const pluginCtx = groupCtx.extend()
const pluginFiber = pluginCtx.plugin(DeepSeekBalanceService)
await pluginFiber
console.log('plugin fiber state:', pluginFiber.state)

// Now the plugin's provide('deepseekBalance') emitted internal/service on
// pluginCtx. Did the gateway (gatewayCtx) hear it? Its srcClaims cache:
const gateway2 = groupCtx.get('typertGateway')
console.log('srcClaims after plugin mount:', gateway2.srcClaims ? [...gateway2.srcClaims] : gateway2.srcClaims)

const conn = groupCtx.get('connection')
console.log('claim deepseekBalance/get:', conn?.matches?.('deepseekBalance/get'))

await ctx.fiber.dispose()
