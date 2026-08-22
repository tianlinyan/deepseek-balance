/**
 * DeepSeek balance plugin — Host half.
 *
 * Registers one TypertRemoteService (`deepseekBalance`) exposing a single
 * `get` Remote method. The method resolves the DEEPSEEK_API_KEY credential
 * through `ctx.credentials` (same source the LLM adapters use, hot-updated per
 * call) and queries the DeepSeek user-balance endpoint:
 *
 *   GET https://api.deepseek.com/user/balance
 *   Authorization: Bearer <api-key>
 *
 * The Gateway discovers the endpoint through its SRC fallback (the
 * `typertRemote` binding + `@Remote` marker), so no generated `./typert`
 * artifact is required: `collectSrcClaims` scans registered Services for the
 * binding and `remoteMethods()` reads the decorator marker table.
 *
 * The result is returned as a plain JSON-safe value shaped like the DeepSeek
 * balance response, e.g.:
 *   {
 *     "is_available": true,
 *     "balance_infos": [
 *       { "currency": "CNY", "total_balance": "110.00",
 *         "granted_balance": "10.00", "topped_up_balance": "100.00" }
 *     ]
 *   }
 * Failures are returned as `{ ok: false, error: { code, message, details } }`
 * so the browser half can render a corrective message instead of a transport
 * error.
 */

import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

/** Credential reference for the DeepSeek API key (same as the LLM adapter). */
export const API_KEY_REF = 'DEEPSEEK_API_KEY'
/** Public DeepSeek balance endpoint (no /v1 prefix on the user API). */
export const BALANCE_URL = 'https://api.deepseek.com/user/balance'
/** Request timeout for the upstream balance call. */
export const BALANCE_TIMEOUT_MS = 15000

/** RPC wire result for a missing or unreadable credential. */
function credentialError() {
  return {
    ok: false,
    error: {
      code: 'api-key-not-configured',
      message: `DEEPSEEK_API_KEY is not configured — add it through the Models page or export it, then retry.`,
      details: {},
    },
  }
}

/** Fold a transport/HTTP failure into the RPC error branch. */
function transportError(error) {
  return {
    ok: false,
    error: {
      code: 'balance-unavailable',
      message: error instanceof Error ? error.message : String(error),
      details: {},
    },
  }
}

/**
 * The DeepSeek balance Remote service. Registered as `deepseekBalance` so the
 * browser half reaches it at the `deepseekBalance/get` endpoint.
 */
export class DeepSeekBalanceService extends TypertRemoteService {
  static inject = ['credentials']

  /**
   * Bind the service key and wire namespace.
   * @param ctx - Host Context carrying the credentials seam.
   */
  constructor(ctx) {
    super(ctx, 'deepseekBalance')
  }

  /**
   * Resolve the balance endpoint to call, per request so a changed proxy
   * takes effect without a process restart: `BALANCE_URL` (env) overrides the
   * built-in endpoint. Agent/browser contexts never see the key — this is the
   * host half only.
   * @returns the endpoint URL to fetch.
   */
  balanceUrl() {
    if (typeof process !== 'undefined') {
      const override = process.env.BALANCE_URL
      if (typeof override === 'string' && override.trim() !== '') return override
    }
    return BALANCE_URL
  }

  /**
   * Fetch the current DeepSeek account balance.
   * @returns the DeepSeek balance payload, or an explicit failure branch.
   */
  async get() {
    const resolved = await this.ctx.credentials.resolve(credentialRef(API_KEY_REF))
    if (resolved === undefined) return credentialError()
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), BALANCE_TIMEOUT_MS)
      try {
        const response = await fetch(this.balanceUrl(), {
          headers: { authorization: `Bearer ${resolved.value}` },
          signal: controller.signal,
        })
        if (!response.ok) {
          return {
            ok: false,
            error: {
              code: 'balance-unavailable',
              message: `DeepSeek balance request failed with HTTP ${response.status}`,
              details: { status: response.status },
            },
          }
        }
        const payload = await response.json()
        return { ok: true, value: payload }
      } finally {
        clearTimeout(timer)
      }
    } catch (error) {
      return transportError(error)
    }
  }
}

// --- SRC marker (decorator simulation) -------------------------------------
// The `@Remote('get')` TS decorator only writes a private WeakMap through its
// `addInitializer` hook; this module applies the same marker by hand so the
// package ships as plain JavaScript with no build step. The initializer runs
// with `this` bound to an object whose prototype is the class prototype, which
// is exactly the instance-time contract the real decorator relies on.
{
  const proto = DeepSeekBalanceService.prototype
  Remote('get')(proto.get, {
    kind: 'method',
    name: 'get',
    static: false,
    private: false,
    addInitializer(fn) {
      fn.call(Object.create(proto))
    },
  })
}

export default DeepSeekBalanceService
