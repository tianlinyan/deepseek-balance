/**
 * DeepSeek balance plugin — Browser half types.
 *
 * The browser half is a hand-written `window.__ModuleLoader__.load` bundle
 * (plain JavaScript, no build step). These declarations mirror the exports so
 * TypeScript consumers can reference the plugin surface.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** Injected business face delivered to the dock entry component. */
export interface BalanceDockInjected {
  /**
   * Call the Host `deepseekBalance/get` Remote through the Connection RPC.
   * @param signal - optional abort signal used to cancel a hung request.
   */
  loadBalance: (signal?: AbortSignal) => Promise<unknown>
}

/** The composer.dock entry component props (runtime kit + injected face). */
export interface BalanceDockProps extends BalanceDockInjected {
  /** Framework session standard kit (subset actually consumed). */
  sessionId?: string
}

/** The dock entry component. */
export declare function BalanceDock(props: BalanceDockProps): unknown

/** Required client services. */
export declare const inject: ['slots', 'connection']

/** Client plugin body. */
export declare function apply(ctx: ClientContext): void
