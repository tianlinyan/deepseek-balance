/**
 * Scratch verification for the v0.1.3 module-level fetch redesign.
 *
 * Loads lib/client.js in a Node context with a stub React (createElement /
 * useEffect / useSyncExternalStore) and a stub localStorage, then drives the
 * BalanceDock component manually:
 *
 *   A. fresh load (no cache)  -> renders 查询中…, then the balance after the
 *      module loop's first fetch resolves;
 *   B. face identity churn    -> re-rendering with a NEW loadBalance identity
 *      must NOT reset the view to 查询中… (the regression this fix targets);
 *   C. cached load            -> a seeded localStorage balance renders
 *      immediately, before any fetch;
 *   D. business error         -> an API-key-missing style result renders the
 *      error message;
 *   E. business error + cache -> the actionable error still surfaces.
 */
import { readFileSync } from 'node:fs'

const SOURCE = new URL('../lib/client.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function makeStorage(seed) {
  const map = new Map(Object.entries(seed ?? {}))
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null },
    setItem(k, v) { map.set(k, String(v)) },
  }
}

function loadBundle(seedStorage) {
  const registrations = []
  const effects = []
  let notify = null

  globalThis.window = {
    __ModuleLoader__: { load(reg) { registrations.push(reg) } },
  }
  globalThis.localStorage = makeStorage(seedStorage)

  const fakeReact = {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children }
    },
    useEffect(fn, deps) { effects.push({ fn, deps }) },
    useSyncExternalStore(subscribe, getSnapshot) {
      if (notify === null) notify = subscribe(() => {})
      return getSnapshot()
    },
  }

  const source = readFileSync(SOURCE, 'utf8')
  ;(0, eval)(source)

  const reg = registrations.find((r) => r.id === 'deepseek-balance')
  if (!reg) throw new Error('bundle did not register deepseek-balance')
  const exports = reg.factory((spec) => {
    if (spec === 'react') return fakeReact
    throw new Error(`unexpected module: ${spec}`)
  })

  const textOf = (element) => {
    const kids = Array.isArray(element.children) ? element.children : [element.children]
    const content = kids.find((k) => typeof k === 'string')
    return content ?? '(no text)'
  }

  function render(face) {
    effects.length = 0
    const el = exports.BalanceDock({ loadBalance: face })
    for (const e of effects) e.fn()
    return textOf(el)
  }

  return { exports, render }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const okFace = async () => ({
  ok: true,
  value: { ok: true, value: { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '44.02' }] } },
})
const bizErrorFace = async () => ({
  ok: true,
  value: { ok: false, error: { code: 'api-key-not-configured', message: 'DEEPSEEK_API_KEY is not configured — add it through the Models page or export it, then retry.' } },
})

let failures = 0
function check(name, actual, expected) {
  const pass = actual === expected
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      expected: ${expected}\n      actual:   ${actual}`)
}

// --- A. fresh load: 查询中… then balance -----------------------------------
{
  const b = loadBundle()
  const t0 = b.render(okFace)
  check('A1 fresh render shows 查询中…', t0, 'DeepSeek 余额: 查询中…')
  await sleep(30) // let the module loop's fetch settle
  const t1 = b.render(okFace)
  check('A2 after fetch shows balance', t1, 'DeepSeek 余额: CNY 44.02')
}

// --- B. face identity churn must not reset to 查询中… ----------------------
{
  const b = loadBundle()
  b.render(okFace)
  await sleep(30)
  const before = b.render(okFace)
  check('B1 balance visible before churn', before, 'DeepSeek 余额: CNY 44.02')
  // Simulate the slot re-materializing the inject face: brand-new function.
  const churned = async () => okFace()
  const after = b.render(churned)
  check('B2 churned face keeps balance (no 查询中 reset)', after, 'DeepSeek 余额: CNY 44.02')
  await sleep(30)
  const after2 = b.render(churned)
  check('B3 still balance after churn + fetch', after2, 'DeepSeek 余额: CNY 44.02')
}

// --- C. cached load: balance renders immediately ---------------------------
{
  const seed = { 'deepseek-balance:last': JSON.stringify({ text: 'CNY 88.88', ts: Date.now() }) }
  const b = loadBundle(seed)
  const t0 = b.render(okFace)
  check('C1 cached render shows balance immediately', t0, 'DeepSeek 余额: CNY 88.88')
  await sleep(30)
  const t1 = b.render(okFace)
  check('C2 refreshed to live balance', t1, 'DeepSeek 余额: CNY 44.02')
}

// --- D. business error renders the message ---------------------------------
{
  const b = loadBundle()
  b.render(bizErrorFace)
  await sleep(30)
  const t1 = b.render(bizErrorFace)
  check('D1 business error shows message', t1, 'DeepSeek 余额: DEEPSEEK_API_KEY is not configured — add it through the Models page or export it, then retry.')
}

// --- E. business error with cache still surfaces the error (actionable) ----
{
  const seed = { 'deepseek-balance:last': JSON.stringify({ text: 'CNY 88.88', ts: Date.now() }) }
  const b = loadBundle(seed)
  b.render(bizErrorFace)
  await sleep(30)
  const t1 = b.render(bizErrorFace)
  check('E1 cache present but business error still shown', t1.startsWith('DeepSeek 余额: DEEPSEEK_API_KEY'), true)
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
