/**
 * Scratch smoke test 4: replicate gateway collectSrcClaims exactly and print
 * every step, to see why deepseekBalance/get is not claimed.
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

const endpointOf = (namespace, method) => `${namespace}/${method}`
const isObject = (value) => typeof value === 'object' && value !== null
const originalOf = (receiver) => {
  const original = Reflect.get(receiver, symbols.original)
  return isObject(original) ? original : receiver
}

class FakeCredentials extends Service {
  async resolve() { return undefined }
}

const ctx = new Context()
ctx.provide('credentials', new FakeCredentials(ctx))
await ctx.plugin(DeepSeekBalanceService)

const claims = new Set()
for (const [serviceKey, definition] of Object.entries(ctx.reflect.props)) {
  if (definition.type !== 'service') continue
  const receiver = ctx.get(serviceKey)
  if (!isObject(receiver)) { console.log(`skip ${serviceKey}: receiver not object`); continue }
  const original = originalOf(receiver)
  const binding = Reflect.get(original, 'typertRemote')
  if (!isObject(binding) || typeof Reflect.get(binding, 'namespace') !== 'string') {
    console.log(`skip ${serviceKey}: no valid typertRemote binding`)
    continue
  }
  const namespace = Reflect.get(binding, 'namespace')
  for (const candidate of remoteMethods(original)) {
    claims.add(endpointOf(namespace, candidate.exportName ?? candidate.method))
    console.log(`claim: ${endpointOf(namespace, candidate.exportName ?? candidate.method)} (from ${serviceKey})`)
  }
}
console.log('claims:', [...claims])
console.log('has deepseekBalance/get:', claims.has('deepseekBalance/get'))
await ctx.fiber.dispose()
