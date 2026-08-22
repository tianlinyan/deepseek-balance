/**
 * DeepSeek balance plugin — Host half types.
 *
 * The host half is plain JavaScript; these declarations describe the exported
 * Remote service so TypeScript consumers (and the DSH Typert SRC fallback
 * documentation) can read the surface without executing the module.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

/** Credential reference name for the DeepSeek API key (same as the LLM adapter). */
export declare const API_KEY_REF: 'DEEPSEEK_API_KEY'
/** Public DeepSeek balance endpoint (overridable via the `BALANCE_URL` env var). */
export declare const BALANCE_URL: string
/** Request timeout for the upstream balance call, in milliseconds. */
export declare const BALANCE_TIMEOUT_MS: number

/** One balance info row from the DeepSeek user-balance API. */
export interface DeepSeekBalanceInfo {
  /** ISO 4217 currency code, e.g. `CNY`. */
  currency: string
  /** Total account balance (string-form decimal from the API). */
  total_balance: string
  /** Promotional / granted balance. */
  granted_balance: string
  /** Topped-up (paid) balance. */
  topped_up_balance: string
}

/** The DeepSeek user-balance API payload. */
export interface DeepSeekBalancePayload {
  /** Whether the account is available for API use. */
  is_available: boolean
  /** Per-currency balance rows. */
  balance_infos: DeepSeekBalanceInfo[]
}

/** Business failure branch returned by the Remote method. */
export interface DeepSeekBalanceFailure {
  /** Stable machine-readable failure code. */
  code: string
  /** Human-readable corrective message. */
  message: string
  /** Additional structured details (may be empty). */
  details: Record<string, unknown>
}

/** Result union returned by `deepseekBalance/get`. */
export type DeepSeekBalanceResult =
  | { ok: true; value: DeepSeekBalancePayload }
  | { ok: false; error: DeepSeekBalanceFailure }

/** The `deepseekBalance` Remote service (namespace on the Gateway SRC fallback). */
export declare class DeepSeekBalanceService extends TypertRemoteService {
  static inject: ['credentials']
  constructor(ctx: Context)
  /** Fetch the current DeepSeek account balance. */
  get(): Promise<DeepSeekBalanceResult>
}

export default DeepSeekBalanceService
