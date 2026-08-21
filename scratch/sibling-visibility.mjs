/**
 * Scratch smoke test 11: gateway inside a nested fiber — does collectSrcClaims
 * (which iterates this.ctx.reflect.props on the gateway's OWN ctx) see a
 * service provided by a SIBLING loader fiber?
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
// Mount the gateway as its own fiber (like a loader entry), NOT directly on root.
const regFiber = ctx.plugin(TypertRegistry)
await regFiber
const gatewayFiber = ctx.plugin(TypertGatewayService)
await gatewayFiber
const connFiber = ctx.plugin(FakeConnection)
await connFiber

const gateway = ctx.get('typertGateway')
console.log('gateway ctx === root ctx:', gateway.ctx === ctx)
console.log('gateway ctx.fiber.name:', gateway.ctx.fiber?.name)

// Mount the plugin as ANOTHER fiber.
await ctx.plugin(FakeCredentials)
const pluginFiber = ctx.plugin(DeepSeekBalanceService)
await pluginFiber
console.log('plugin fiber state:', pluginFiber.state)

// Now: the gateway's own ctx.reflect.props
console.log('gateway ctx reflect.props has deepseekBalance:', 'deepseekBalance' in gateway.ctx.reflect.props)
console.log('root reflect.props has deepseekBalance:', 'deepseekBalance' in ctx.reflect.props)
console.log('gateway ctx.get deepseekBalance:', gateway.ctx.get('deepseekBalance') !== undefined)

const conn = ctx.get('connection')
if (conn?.matches) {
  console.log('claim deepseekBalance/get:', conn.matches('deepseekBalance/get'))
}

await ctx.fiber.dispose()
