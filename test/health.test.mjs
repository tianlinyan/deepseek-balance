/**
 * Dependency-free regression / consistency guard.
 *
 * Runs with the built-in Node test runner (`node --test test/`), needs no
 * installed dependencies (the plugin's peer deps are provided by the DSH host,
 * so they are deliberately not importable here). It guards the concrete issues
 * found in review without requiring a build step or a GraphQL/npm install:
 *
 *   1. LICENSE must stay UTF-8 (no UTF-16 BOM) so license detection/scanning
 *      tools can read it.
 *   2. package.json version, CHANGELOG head, and the README pinned install tag
 *      must stay in sync (so docs never point consumers at an older release).
 *   3. The injected client `loadBalance` signature must keep its `signal`
 *      parameter, matching the real business face.
 *   4. The host half must keep its `balanceUrl()` / `BALANCE_URL` seam, and the
 *      browser half its shape-tolerant classifier helpers — a regression here
 *      silently breaks the endpoint override or the wire-shape handling.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

test('LICENSE is UTF-8 without a BOM and starts with the MIT header', () => {
  const bytes = readFileSync(join(root, 'LICENSE'))
  // UTF-16LE BOM is FF FE / FE FF; a UTF-8 file must begin with ASCII text.
  const bom = bytes[0] === 0xff && bytes[1] === 0xfe
  const start = bytes.subarray(0, 3).toString('ascii')
  assert.equal(bom, false, 'LICENSE must not carry a UTF-16 BOM')
  assert.equal(start, 'MIT', 'LICENSE must start with the MIT header')
})

test('package.json, CHANGELOG, and README pinned tag agree on the version', () => {
  const pkg = JSON.parse(read('package.json'))
  const changelog = read('CHANGELOG.md')
  const readme = read('README.md')
  const head = changelog.match(/^## \[([^\]]+)\] - /m)
  assert.ok(pkg.version, 'package.json must declare a version')
  assert.equal(head?.[1], pkg.version, 'CHANGELOG head must match package version')
  // Only real install pins count (the `git+...#vX.Y.Z"` form). The upgrade
  // example's illustrative "bump `#v0.1.1` to `#v0.1.3`" is not a pin.
  const pins = [...readme.matchAll(/#v([0-9]+\.[0-9]+\.[0-9]+)"/g)].map((m) => m[1])
  assert.ok(pins.length > 0, 'README should pin at least one released tag')
  for (const pin of pins) {
    assert.equal(pin, pkg.version, `README pinned tag #v${pin} must match package version ${pkg.version}`)
  }
})

test('client injected loadBalance keeps an optional signal parameter', () => {
  const dts = read('lib/types/client/index.d.ts')
  assert.match(dts, /loadBalance:\s*\(signal\?: AbortSignal\)/, 'loadBalance must declare its signal param')
})

test('host half keeps the BALANCE_URL override seam', () => {
  const src = read('lib/index.js')
  assert.match(src, /balanceUrl\(\)/, 'host must implement balanceUrl()')
  assert.match(src, /process\.env\.BALANCE_URL/, 'balanceUrl() must read the BALANCE_URL env override')
})

test('browser half keeps the shape-tolerant classifier helpers', () => {
  const src = read('lib/client.js')
  assert.match(src, /function looksLikeBalancePayload/, 'browser half must keep looksLikeBalancePayload')
  assert.match(src, /function classifyPayload/, 'browser half must keep classifyPayload')
})
