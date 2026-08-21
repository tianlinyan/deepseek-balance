/**
 * Scratch smoke test 3: debug why collectSrcClaims misses deepseekBalance/get.
 */
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join('C:/Users/tly00/.dsh/profiles/node_modules', 'x.js'))

const { Context, Service, symbols } = require('@deepseek-ai/cordis')
const { remoteMethods } = require('@deepseek-ai/dsh-typert-protocol')

const plugin = await import(pathToFileURL(path.join(__dirname, '..', 'lib', 'index.js')).href)
const { DeepSeekBalanceService } = plugin

class FakeCredentials extends Service {
  async resolve() { return undefined }
}

const ctx = new Context()
ctx.provide('credentials', new FakeCredentials(ctx))
// Mount the service the way a Service-class plugin mounts: ctx.plugin(class).
await ctx.plugin(DeepSeekBalanceService)

console.log('=== reflect.props ===')
for (const [key, def] of Object.entries(ctx.reflect.props)) {
  console.log(key, '->', def?.type ?? def)
}

const serviceKey = 'deepseekBalance'
const receiver = ctx.get(serviceKey)
console.log('receiver:', receiver)
console.log('receiver is object:', typeof receiver === 'object' && receiver !== null)

const original = (() => {
  const o = Reflect.get(receiver, symbols.original)
  return o !== null && typeof o === 'object' ? o : receiver
})()
console.log('original === receiver:', original === receiver)
console.log('original proto === DeepSeekBalanceService.prototype:', Object.getPrototypeOf(original) === DeepSeekBalanceService.prototype)

const binding = Reflect.get(original, 'typertRemote')
console.log('binding:', binding)
console.log('binding namespace:', binding?.namespace)

const methods = remoteMethods(original)
console.log('remoteMethods(original):', JSON.stringify(methods))
const methodsOnProto = remoteMethods(Object.getPrototypeOf(original) === DeepSeekBalanceService.prototype ? original : original)
console.log('markers on prototype of DeepSeekBalanceService:', JSON.stringify(remoteMethods(Object.create(DeepSeekBalanceService.prototype))))

// Also directly test the marker table via a fresh instance
const inst = new DeepSeekBalanceService(ctx)
console.log('remoteMethods(fresh instance):', JSON.stringify(remoteMethods(inst)))

await ctx.fiber.dispose()
