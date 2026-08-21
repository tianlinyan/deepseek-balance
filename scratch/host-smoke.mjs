/**
 * Scratch smoke test: exercise the plugin host half against the REAL installed
 * @deepseek-ai packages (cordis, dsh-typert-protocol, dsh-credentials) to find
 * where the SRC claim / dispatch flow breaks.
 */
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const profilesModules = 'C:/Users/tly00/.dsh/profiles/node_modules'
const require = createRequire(path.join(profilesModules, 'x.js'))

const { Context, Service } = require('@deepseek-ai/cordis')
const typert = require('@deepseek-ai/dsh-typert-protocol')
const credentials = require('@deepseek-ai/dsh-credentials')

console.log('=== cordis ===', typeof Context, typeof Service)
console.log('=== typert exports ===', Object.keys(typert))
console.log('=== credentials exports ===', Object.keys(credentials))

// Load the plugin host half through the same module graph.
const plugin = await import(pathToFileURL(path.join(__dirname, '..', 'lib', 'index.js')).href)
console.log('=== plugin exports ===', Object.keys(plugin))
const { DeepSeekBalanceService } = plugin

// Simulate what the Gateway does: after the service is registered, collectSrcClaims
// iterates ctx.reflect.props, gets each service, reads typertRemote, remoteMethods.
const ctx = new Context()
// Provide a fake 'credentials' service so static inject resolves.
class FakeCredentials extends Service {
  async resolve() { return undefined }
}
ctx.provide('credentials', new FakeCredentials(ctx))

const service = new DeepSeekBalanceService(ctx)
console.log('service name:', service.name)
console.log('typertRemote:', service.typertRemote)

// What the gateway does:
const original = service // assume no proxy here
const binding = Reflect.get(original, 'typertRemote')
console.log('binding namespace:', binding?.namespace)
const methods = typert.remoteMethods(original)
console.log('remoteMethods:', methods)

// Check ctx.reflect.props has our service
console.log('reflect.props deepseekBalance:', ctx.reflect.props['deepseekBalance'])

// Now exercise methodParameterNames + srcDescriptor result shape: call get() with a resolved credential.
// Provide a credential that returns a value, intercept fetch.
const ctx2 = new Context()
let lastUrl = null
let lastHeaders = null
globalThis.fetch = async (url, init) => {
  lastUrl = String(url)
  lastHeaders = init?.headers
  return {
    ok: true,
    status: 200,
    json: async () => ({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '116.09', granted_balance: '0.00', topped_up_balance: '116.09' }] }),
  }
}
class FakeCredentials2 extends Service {
  async resolve() {
    return { value: 'sk-test', source: 'env' }
  }
}
ctx2.provide('credentials', new FakeCredentials2(ctx2))
const svc2 = new DeepSeekBalanceService(ctx2)
const result = await svc2.get()
console.log('get() result:', JSON.stringify(result))
console.log('fetch url:', lastUrl)
console.log('fetch headers:', JSON.stringify(lastHeaders))

await ctx.fiber.dispose()
await ctx2.fiber.dispose()
console.log('=== host smoke OK ===')
