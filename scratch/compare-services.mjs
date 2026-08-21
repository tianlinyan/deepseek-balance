/**
 * Scratch smoke test 8: compare a real installed TypertRemoteService package
 * (PluginInventoryGateway) against deepseek-balance under the loader-style
 * mount, to find why the real one is claimable but ours isn't.
 */
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join('C:/Users/tly00/.dsh/profiles/node_modules', 'x.js'))

const { Context, Service } = require('@deepseek-ai/cordis')
const { remoteMethods } = require('@deepseek-ai/dsh-typert-protocol')

const { PluginInventoryGateway } = require('@deepseek-ai/dsh-host-plugin-inventory')
const plugin = await import(pathToFileURL(path.join(__dirname, '..', 'lib', 'index.js')).href)
const { DeepSeekBalanceService } = plugin

console.log('PluginInventoryGateway inject:', PluginInventoryGateway.inject)
console.log('DeepSeekBalanceService inject:', DeepSeekBalanceService.inject)

// Fake loader service for PluginInventoryGateway (static inject = ['loader'])
class FakeLoader extends Service {
  constructor(ctx) { super(ctx, 'loader') }
  entries() { return [] }
}

for (const [label, cls, pre] of [
  ['plugin-inventory', PluginInventoryGateway, (ctx) => ctx.plugin(FakeLoader)],
  ['deepseek-balance', DeepSeekBalanceService, (ctx) => ctx.plugin(FakeLoader)],
]) {
  const ctx = new Context()
  if (pre) await pre(ctx)
  const fiber = ctx.plugin(cls)
  await fiber
  const state = fiber.state
  const visible = ctx.get(cls === PluginInventoryGateway ? 'pluginInventory' : 'deepseekBalance')
  const props = Object.keys(ctx.reflect.props).filter(k => k === 'pluginInventory' || k === 'deepseekBalance')
  console.log(`\n[${label}] fiber.state=${state}`)
  console.log(`  visible via ctx.get:`, visible !== undefined)
  console.log(`  in root reflect.props:`, props)
  if (visible !== undefined) {
    const original = visible
    console.log('  binding:', Reflect.get(original, 'typertRemote')?.namespace)
    console.log('  remoteMethods:', JSON.stringify(remoteMethods(original)))
  }
  await ctx.fiber.dispose()
}
