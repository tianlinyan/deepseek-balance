/**
 * Scratch smoke test 17: execute the client bundle factory in a jsdom window
 * exactly like the module loader would (seed react, window.__ModuleLoader__),
 * and check the exports + apply() registers the dock entry.
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readFileSync } from 'node:fs'

const requireHarness = createRequire(path.join('C:/Users/tly00/deepseek-harness/node_modules/.pnpm/jsdom@29.1.1/node_modules/', 'x.js'))
const { JSDOM } = requireHarness('jsdom')
const require = createRequire(path.join('C:/Users/tly00/.dsh/profiles/node_modules', 'x.js'))
const React = require('react')
const ReactDOM = require('react-dom/client')

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://127.0.0.1:3080/',
  pretendToBeVisual: true,
})
const { window } = dom
globalThis.window = window
globalThis.document = window.document

// Fake module table: seed react only.
const seed = new Map([['react', React]])
const factories = new Map()
const loadCache = new Map()
function makeRequire(edges) {
  return (spec) => {
    edges.add(spec)
    if (seed.has(spec)) return seed.get(spec)
    if (loadCache.has(spec)) return loadCache.get(spec).exports
    if (factories.has(spec)) return materialize(spec).exports
    throw new Error(`missed module table: ${spec}`)
  }
}
function materialize(id) {
  const edges = new Set()
  const exports = factories.get(id)(makeRequire(edges))
  const record = { id, exports, edges }
  loadCache.set(id, record)
  return record
}

window.__ModuleLoader__ = {
  mode: 'queue',
  pendingQueue: [],
  load(registration) { this.pendingQueue.push(registration) },
  create() { throw new Error('not needed') },
}

// Evaluate the bundle source in the jsdom window.
const source = readFileSync(path.join('C:/my_project/dsh/deepseek-balance/lib/client.js'), 'utf8')
window.eval(source)

// Registration should have been queued.
console.log('pending registrations:', window.__ModuleLoader__.pendingQueue.length)
const reg = window.__ModuleLoader__.pendingQueue[0]
console.log('registration id:', reg?.id)
const moduleExports = reg.factory(makeRequire(new Set()))
console.log('exports keys:', Object.keys(moduleExports))
console.log('inject:', moduleExports.inject)
console.log('apply is fn:', typeof moduleExports.apply === 'function')
console.log('BalanceDock is fn:', typeof moduleExports.BalanceDock === 'function')

// Minimal ctx: slots + connection + effect.
const registrations = []
const ctx = {
  slots: {
    inject(name, cb) {
      // declaration exists immediately
      const dispose = cb()
      return () => { typeof dispose === 'function' && dispose() }
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  },
  connection: {
    rpc: {
      call(channel, endpoint, payload) {
        console.log('RPC CALL:', channel, endpoint, JSON.stringify(payload))
        return Promise.resolve({ ok: true, value: { ok: true, value: { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '56.34' }] } } })
      },
    },
  },
  effect(fn) {
    const dispose = fn()
    return () => { typeof dispose === 'function' && dispose() }
  },
  get() { return undefined },
}

moduleExports.apply(ctx)
console.log('registrations:', registrations.map(r => `${r.options.name}#${r.options.id} order=${r.options.order}`))
const dock = registrations.find(r => r.options.name === 'conversation.composer.dock')
console.log('dock registered:', dock !== undefined)
console.log('dock inject face keys:', dock ? Object.keys(dock.options.inject()) : null)

// Style tag should be injected.
await new Promise(r => setTimeout(r, 10))
console.log('style tags:', document.querySelectorAll('style[data-plugin-css]').length)

// Render the component with the injected face.
if (dock) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)
  const Comp = dock.component
  const props = { ...dock.options.inject() }
  await new Promise((resolve) => {
    root.render(React.createElement(Comp, props))
    setTimeout(resolve, 30)
  })
  console.log('rendered text:', container.textContent)
  console.log('rendered html:', container.innerHTML.slice(0, 300))
}
console.log('=== client bundle smoke OK ===')
