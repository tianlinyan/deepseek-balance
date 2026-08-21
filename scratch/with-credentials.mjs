/**
 * Scratch smoke test 9: deepseek-balance with a real credentials service
 * provided — does the fiber become active and the claim appear?
 */
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join('C:/Users/tly00/.dsh/profiles/node_modules', 'x.js'))

const { Context, Service } = require('@deepseek-ai/cordis')
const { remoteMethods } = require('@deepseek-ai/dsh-typert-protocol')

const plugin = await import(pathToFileURL(path.join(__dirname, '..', 'lib', 'index.js')).href)
const { DeepSeekBalanceService } = plugin

class FakeCredentials extends Service {
  constructor(ctx) { super(ctx, 'credentials') }
  async resolve() { return undefined }
}

const ctx = new Context()
const credFiber = ctx.plugin(FakeCredentials)
await credFiber
const fiber = ctx.plugin(DeepSeekBalanceService)
await fiber
console.log('fiber.state:', fiber.state)
console.log('visible:', ctx.get('deepseekBalance') !== undefined)
console.log('reflect.props:', Object.keys(ctx.reflect.props).filter(k => k === 'deepseekBalance'))
const svc = ctx.get('deepseekBalance')
if (svc) {
  console.log('binding:', Reflect.get(svc, 'typertRemote')?.namespace)
  console.log('remoteMethods:', JSON.stringify(remoteMethods(svc)))
}
await ctx.fiber.dispose()
