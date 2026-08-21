/**
 * Scratch smoke test 16: EXACT live pattern — gateway + plugin as SIBLING
 * child ctxs of a shared parent (like the include tree), srcClaims computed
 * (empty) BEFORE the plugin exists, then the plugin mounts. Does the cached
 * claim invalidate and recompute?
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

const root = new Context()
const groupCtx = root // the include's ctx

// Gateway mounts on its OWN child ctx (like include:typert-gateway).
const gatewayCtx = groupCtx.extend()
await gatewayCtx.plugin(TypertRegistry)
await gatewayCtx.plugin(TypertGatewayService)
await gatewayCtx.plugin(FakeConnection)

const gateway = gatewayCtx.get('typertGateway')
const conn = gatewayCtx.get('connection')

// 1) First claim check before plugin exists -> cache empty.
console.log('pre claim:', conn.matches('deepseekBalance/get'))
console.log('pre srcClaims:', gateway.srcClaims ? [...gateway.srcClaims] : gateway.srcClaims)

// 2) Plugin mounts on ANOTHER child ctx of the same group (like include:deepseek-balance).
const pluginCtx = groupCtx.extend()
await pluginCtx.plugin(FakeCredentials)
const pluginFiber = pluginCtx.plugin(DeepSeekBalanceService)
await pluginFiber
console.log('plugin fiber state:', pluginFiber.state)

// Did internal/service invalidate the gateway's cache?
console.log('post srcClaims:', gateway.srcClaims ? [...gateway.srcClaims] : gateway.srcClaims)
console.log('post claim:', conn.matches('deepseekBalance/get'))

await root.fiber.dispose()
