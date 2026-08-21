/**
 * Scratch smoke test 7: does a Service provided on a NESTED fiber context show
 * up in the ROOT ctx.reflect.props (what collectSrcClaims iterates)?
 */
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join('C:/Users/tly00/.dsh/profiles/node_modules', 'x.js'))

const { Context, Service } = require('@deepseek-ai/cordis')

const plugin = await import(pathToFileURL(path.join(__dirname, '..', 'lib', 'index.js')).href)
const { DeepSeekBalanceService } = plugin

const ctx = new Context()

// Mount the plugin the way the Loader does: ctx.plugin(class) creates a nested fiber.
const fiber = ctx.plugin(DeepSeekBalanceService)
await fiber

console.log('root reflect.props has deepseekBalance:', 'deepseekBalance' in ctx.reflect.props)
console.log('root ctx.get("deepseekBalance"):', ctx.get('deepseekBalance') !== undefined)

// Also simulate what the loader does with unwrapExports: default export
const loaded = await import(pathToFileURL(path.join(__dirname, '..', 'lib', 'index.js')).href)
const unwrapped = loaded.default
console.log('unwrapped default is class:', typeof unwrapped === 'function', unwrapped?.name)

await ctx.fiber.dispose()
