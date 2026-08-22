/**
 * DeepSeek balance plugin — Browser half (hand-written bundle).
 *
 * Registers one entry in the `conversation.composer.dock` list slot (the band
 * under the composer card, same row family as the StatsLine) and renders the
 * DeepSeek account total balance fetched from the Host via the Gateway's SRC
 * fallback: the Host half binds `typertRemote` (namespace `deepseekBalance`)
 * and marks its `get` method, so the Gateway claims the `deepseekBalance/get`
 * endpoint without any generated `./typert` artifact. This bundle calls it
 * through the generic Connection RPC (`/api` channel), which needs no
 * per-method client contribution.
 *
 * Layout: composer.dock is a list slot whose entries stack vertically by
 * default. This entry (order -10, first) injects a scoped `<style>` that turns
 * the dock container into a flex row, so the balance sits on the SAME line as
 * the built-in StatsLine, leftmost:
 *
 *   DeepSeek 余额: CNY 116.25 | 2 轮 · 161 步 | LLM 31m55s · ...
 *
 * The style targets only `[data-slot="conversation.composer.dock"]` and its
 * direct children, so nothing else in the app is affected. If the slot
 * structure ever changes, the entry degrades to its own line above the stats.
 *
 * Wire shape: `rpc.call('/api', 'deepseekBalance/get', { args: {} })` returns
 * the carrier result `{ ok, value | error }`; the business result is the
 * second level — `value` is itself `{ ok, value | error }` with the DeepSeek
 * payload on success.
 *
 * Fetch lifecycle (v0.1.3): the fetch loop and the last-known view live at
 * MODULE scope, outside React. The component is a plain subscriber
 * (`useSyncExternalStore`). This makes the display immune to the failure mode
 * where a remount or an effect re-run — e.g. the slot inject face being
 * re-materialized after a session-provider roster change right after page
 * load, or the dock entry remounting during session restore — would otherwise
 * reset the view to "查询中…" and invalidate the in-flight attempt, leaving
 * the dock stuck on "查询中…" for minutes. The loop is single-flight (never
 * more than one in-flight attempt), each attempt is bounded by a 6s timeout
 * (the underlying fetch is aborted), transport misses retry with exponential
 * backoff (3s → 6s → 12s → 15s, ladder restarted at the cap), and the last
 * successful balance is persisted to localStorage so a refresh shows it
 * immediately instead of "查询中…" while the first fetch runs.
 *
 * The bundle is plain JavaScript (no build step): it registers through
 * `window.__ModuleLoader__.load({ id, factory })`, takes React from the
 * platform module table, and exposes `{ name, inject, apply }` like any other
 * client plugin. It imports no other @deepseek-ai value, so it passes the
 * client-bundle purity rule.
 */
(function () {
  window.__ModuleLoader__.load({
    id: "deepseek-balance",
    factory: function (require) {
      var module = { exports: {} };
      var exports = module.exports;
      Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

      var React = require("react");
      var useEffect = React.useEffect;
      var useSyncExternalStore = React.useSyncExternalStore;
      var createElement = React.createElement;

      var inject = ["slots", "connection"];

      /** Ambient refresh interval after a definitive answer: 60 seconds. */
      var REFRESH_MS = 60 * 1000;
      /** One fetch attempt must settle within this window, or it counts as a transport miss (a hung transport must not sit on "查询中" forever). */
      var FETCH_TIMEOUT_MS = 6 * 1000;
      /** Exponential-backoff base delay between transport misses. */
      var RETRY_BASE_MS = 3 * 1000;
      /** Exponential-backoff cap (3s → 6s → 12s → 15s → …). */
      var RETRY_MAX_MS = 15 * 1000;
      /** Backoff ladder length: after this many consecutive misses the ladder restarts, so recovery stays fast whenever the endpoint comes back. */
      var MAX_BACKOFF_STEPS = 4;
      /** Consecutive transport misses before a failure message shows (only when no cached value is on display); retries keep running in the background. */
      var MAX_CONSECUTIVE_MISSES = 3;
      /** localStorage key for the last successful balance text. */
      var CACHE_KEY = "deepseek-balance:last";
      /** A cached balance stays presentable this long without a fresh fetch (an account balance changes slowly). */
      var CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

      /** Scoped style: dock entries on one line, balance leftmost, stats keep their text style. */
      var DOCK_ROW_CSS =
        "[data-slot=\"conversation.composer.dock\"]{display:flex!important;align-items:baseline;justify-content:center;gap:10px;max-width:100%}" +
        "[data-slot=\"conversation.composer.dock\"]>*{flex:0 1 auto;width:auto!important;max-width:100%}" +
        "[data-slot=\"conversation.composer.dock\"]>[data-plugin=\"deepseek-balance\"]{flex:none;white-space:nowrap;padding:4px 0 0}";

      /**
       * Read the total balance off the DeepSeek payload.
       * @param payload - `{ is_available, balance_infos: [...] }`.
       * @returns display string like `CNY 116.25`, or null when the payload is
       * absent or malformed (empty list, non-object entry, non-numeric total).
       */
      function totalBalanceText(payload) {
        if (!payload || typeof payload !== "object") return null;
        var infos = payload.balance_infos;
        if (!Array.isArray(infos) || infos.length === 0) return null;
        var info = infos[0];
        if (info === null || typeof info !== "object") return null;
        var currency = info.currency;
        var total = info.total_balance;
        if (total === undefined || total === null) return null;
        if (typeof total !== "number" && typeof total !== "string") return null;
        if (typeof total === "number" && !Number.isFinite(total)) return null;
        if (typeof total === "string" && !/^-?\d+(\.\d+)?$/.test(total.trim())) return null;
        return (typeof currency === "string" && currency !== "" ? currency + " " : "") + total;
      }

      /**
       * Whether the current moment falls on a Beijing-time weekend
       * (Saturday or Sunday), measured in Asia/Shanghai.
       * @returns true on Sat/Sun (Beijing time), false otherwise (or when the
       * clock cannot be resolved — safe default is a weekday).
       */
      function isBeijingWeekend() {
        try {
          var parts = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Shanghai",
            weekday: "short",
          }).formatToParts(new Date())
          var weekdayField = parts.find(function (part) { return part.type === "weekday" })
          if (weekdayField === undefined) return false
          return weekdayField.value === "Sat" || weekdayField.value === "Sun"
        } catch (error) {
          return false
        }
      }

      /**
       * Whether the current moment falls inside a DeepSeek peak window,
       * measured in Beijing time (Asia/Shanghai). Peak windows are 09:00–12:00
       * and 14:00–18:00 (half-open intervals: 12:00 and 18:00 sharp count as
       * off-peak). Since the 2026-08-23 billing change, weekends have NO peak
       * window — Saturday/Sunday are billed at the off-peak (low-value) price
       * all day, so a weekend always reads as off-peak.
       * @returns true during a WEEKDAY peak hour, false otherwise (weekend or
       * outside the windows — safe default is off-peak when the clock cannot
       * be resolved).
       */
      function isBeijingPeakHour() {
        if (isBeijingWeekend()) return false
        try {
          var parts = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Shanghai",
            hour: "numeric",
            hour12: false,
          }).formatToParts(new Date())
          var hourField = parts.find(function (part) { return part.type === "hour" })
          if (hourField === undefined) return false
          var hour = Number(hourField.value) % 24
          return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18)
        } catch (error) {
          return false
        }
      }

      // --- Module-level fetch state ----------------------------------------
      // Everything below lives OUTSIDE React on purpose. The dock entry can be
      // remounted or re-rendered with a fresh inject face at any time (session
      // restore, provider-roster changes, HMR reloads); none of that may reset
      // the display to "查询中…" or kill an in-flight attempt. The component
      // only subscribes to this store and refreshes the loop's face.

      /**
       * Read the persisted last-known balance.
       * @returns display text like `CNY 116.25`, or null when absent/expired.
       */
      function readCache() {
        try {
          var raw = localStorage.getItem(CACHE_KEY);
          if (raw === null) return null;
          var parsed = JSON.parse(raw);
          if (parsed === null || typeof parsed !== "object") return null;
          if (typeof parsed.text !== "string" || parsed.text === "") return null;
          if (typeof parsed.ts !== "number" || Date.now() - parsed.ts > CACHE_MAX_AGE_MS) return null;
          return parsed.text;
        } catch (error) {
          return null;
        }
      }

      /** Persist the latest successful balance text (best-effort). */
      function writeCache(text) {
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ text: text, ts: Date.now() }));
        } catch (error) {
          /* storage disabled / quota — the cache is an optimization only */
        }
      }

      var initialText = readCache();
      var store = {
        /** Current view: `{ status: "loading" }`, `{ status: "ready", text, stale }`, `{ status: "error", message }`. */
        view: initialText === null ? { status: "loading" } : { status: "ready", text: initialText, stale: true },
        /** Latest injected `loadBalance` face (refreshed on every render). */
        loadBalance: null,
        listeners: new Set(),
        started: false,
      };

      /** React external-store subscribe: stable identity for useSyncExternalStore. */
      function subscribe(fn) {
        store.listeners.add(fn);
        return function () {
          store.listeners.delete(fn);
        };
      }
      /** React external-store getSnapshot: stable reference between publishes. */
      function getSnapshot() {
        return store.view;
      }
      /** Publish a new view object and notify subscribers. */
      function publish(next) {
        store.view = next;
        var listeners = Array.from(store.listeners);
        for (var i = 0; i < listeners.length; i++) {
          try {
            listeners[i]();
          } catch (error) {
            /* a subscriber must not break the loop */
          }
        }
      }

      /**
       * Whether a value already looks like a DeepSeek balance payload (vs the
       * business envelope `{ ok, value | error }`). The Gateway's SRC fallback
       * currently returns the method result wrapped in a carrier, but a future
       * version could return the payload unwrapped — accepting both keeps this
       * classifier forward-compatible rather than silently misreading a
       * success as a failure (an unwrapped payload has no `ok` field).
       */
      function looksLikeBalancePayload(value) {
        return value !== null && typeof value === "object" &&
          (Object.hasOwn(value, "is_available") || Object.hasOwn(value, "balance_infos"));
      }

      /** Fold a balance payload into a definitive display outcome. */
      function classifyPayload(payload) {
        // The balance service itself reports unavailable — surface that
        // instead of pretending the payload is a balance.
        if (payload.is_available === false) return { kind: "business-error", message: "余额服务不可用" };
        var text = totalBalanceText(payload);
        if (text === null) return { kind: "business-error", message: "余额数据为空" };
        return { kind: "ok", text: text };
      }

      /**
       * Whether a resolved Gateway error is a transient condition worth
       * retrying. `invocation-unavailable` is the endpoint-claim race: around
       * page load or a host restart the service may not be claimed yet, but the
       * claim settles within moments, so an aggressive message would be wrong.
       * A genuine transient transport failure never RESOLVES here — it rejects
       * and lands in the loop's rejection handler — so only this one code is
       * recoverable while still surfacing real misconfiguration.
       */
      function isTransientGatewayCode(code) {
        return code === "invocation-unavailable";
      }

      /**
       * Classify one RPC outcome.
       * @returns `{ kind: "ok", text }`, `{ kind: "business-error", message }`
       * (definitive, actionable), or `{ kind: "transport" }` (transient —
       * worth a backoff retry).
       */
      function classifyCarrier(carrier) {
        // A null/undefined value is an incomplete/partial response — treat it
        // as transient (the endpoint may still be claiming).
        if (carrier === null || carrier === undefined) return { kind: "transport" };
        // A RESOLVED non-ok carrier is a Gateway answer. The endpoint-claim
        // race stays transient (quick retry); every other resolved failure is a
        // definitive business error to surface instead of retrying a doomed
        // endpoint forever.
        if (carrier.ok !== true) {
          var gatewayError = carrier.error ? carrier.error : {};
          if (isTransientGatewayCode(gatewayError.code)) return { kind: "transport" };
          return { kind: "business-error", message: gatewayError.message || "余额请求失败" };
        }
        // Level 2: the hosted business result, which may be the wrapped
        // `{ ok, value | error }` envelope or the unwrapped payload itself.
        var business = carrier.value;
        if (business === null || typeof business !== "object") {
          return { kind: "business-error", message: "余额数据为空" };
        }
        if (looksLikeBalancePayload(business)) return classifyPayload(business);
        if (business.ok !== true) {
          var businessError = business.error ? business.error : {};
          return { kind: "business-error", message: businessError.message || "查询失败" };
        }
        var payload = business.value;
        if (payload === null || typeof payload !== "object") {
          return { kind: "business-error", message: "余额数据为空" };
        }
        return classifyPayload(payload);
      }

      /**
       * Start the single-flight fetch loop (idempotent: runs once per page).
       * The loop owns its own timer chain and is never invalidated by React
       * re-renders; it always uses the latest injected face from `store`.
       */
      function startLoop() {
        if (store.started) return;
        store.started = true;

        var misses = 0;
        var schedTimer = null;
        var fetchTimer = null;
        var alive = true;

        function nextDelay() {
          if (misses === 0) return REFRESH_MS;
          return Math.min(RETRY_BASE_MS * Math.pow(2, misses - 1), RETRY_MAX_MS);
        }
        function clearFetchTimer() {
          if (fetchTimer !== null) {
            clearTimeout(fetchTimer);
            fetchTimer = null;
          }
        }
        function schedule(delay) {
          schedTimer = setTimeout(attempt, delay);
        }

        /** Transport miss: grow the backoff, surface a message only when nothing is on display. */
        function onMiss() {
          misses++;
          if (misses === MAX_CONSECUTIVE_MISSES && store.view.status !== "ready") {
            publish({ status: "error", message: "余额请求失败，稍后自动重试" });
          }
          // Restart the ladder once it has reached its cap, so the next
          // attempt is never far away when the endpoint comes back.
          if (misses > MAX_BACKOFF_STEPS) misses = 1;
          schedule(nextDelay());
        }

        function attempt() {
          if (!alive) return;
          var face = store.loadBalance;
          if (typeof face !== "function") {
            // No face yet (first render pending): wait a beat and retry.
            schedule(250);
            return;
          }
          var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
          var timeout = new Promise(function (_, reject) {
            fetchTimer = setTimeout(function () {
              if (controller !== null) controller.abort();
              reject(new Error("timeout"));
            }, FETCH_TIMEOUT_MS);
          });
          // Defensive wrapper: a synchronous throw from the face becomes a
          // rejected promise (transport miss) instead of killing the loop.
          var call = Promise.resolve().then(function () {
            return face(controller !== null ? controller.signal : undefined);
          });
          Promise.race([call, timeout]).then(
            function (carrier) {
              if (!alive) return;
              clearFetchTimer();
              var outcome = classifyCarrier(carrier);
              if (outcome.kind === "ok") {
                misses = 0;
                publish({ status: "ready", text: outcome.text, stale: false });
                writeCache(outcome.text);
                schedule(REFRESH_MS);
                return;
              }
              if (outcome.kind === "business-error") {
                // Definitive answer (missing API key, unavailable service,
                // empty data): reset the backoff, refresh on the ambient
                // cadence so a fixed configuration is re-checked.
                misses = 0;
                publish({ status: "error", message: outcome.message });
                schedule(REFRESH_MS);
                return;
              }
              onMiss();
            },
            function () {
              if (!alive) return;
              clearFetchTimer();
              onMiss();
            }
          );
        }

        attempt();
      }

      /**
       * BalanceDock: the composer.dock entry. Receives the framework session
       * kit plus the injected `loadBalance` face, and subscribes to the
       * module-level view store. A status dot precedes the label: red during
       * WEEKDAY Beijing peak hours (09–12, 14–18), green on weekends (off-peak
       * all day, per the 2026-08-23 billing change) and outside the windows.
       *
       * Boot-race handling: right after a page load or host restart the
       * transport may not be ready yet and the first RPC can hang. Every
       * attempt is bounded by FETCH_TIMEOUT_MS (and aborted), transport
       * misses retry with exponential backoff from the module loop, and the
       * last-known balance from localStorage renders immediately — so the
       * entry shows a number instead of sitting on "查询中…" across refreshes.
       */
      function BalanceDock(props) {
        var loadBalance = props.loadBalance;
        // Keep the loop's face current. Identity of the injected face may
        // change across renders (slot inject re-materialization); assigning
        // here is idempotent and lets the single loop always use the newest
        // face without ever restarting.
        if (typeof loadBalance === "function") store.loadBalance = loadBalance;
        var view = useSyncExternalStore(subscribe, getSnapshot);

        useEffect(function () {
          startLoop();
        }, []);

        // Status dot: red during weekday Beijing peak hours (09-12, 14-18),
        // green on weekends (off-peak all day) and outside the windows.
        var peak = isBeijingPeakHour();
        var weekend = isBeijingWeekend();
        var indicator = createElement("span", {
          "aria-hidden": true,
          style: {
            display: "inline-block",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: peak ? "#e5484d" : "#46a758",
            marginRight: "6px",
            verticalAlign: "middle",
            flex: "none",
          },
        });

        var content;
        if (view.status === "loading") {
          content = "DeepSeek 余额: 查询中…";
        } else if (view.status === "error") {
          content = "DeepSeek 余额: " + view.message;
        } else {
          content = "DeepSeek 余额: " + view.text;
        }

        var peakHint;
        if (weekend) {
          peakHint = "DeepSeek 周末全天按低谷价收费";
        } else {
          peakHint = peak
            ? "DeepSeek 高峰时段（北京时间工作日 9:00-12:00、14:00-18:00）"
            : "DeepSeek 非高峰时段（工作日）";
        }
        var title = view.status === "ready" && view.stale
          ? "DeepSeek 余额（上次获取，后台刷新中）· " + peakHint
          : peakHint;

        return createElement("div", {
          "data-plugin": "deepseek-balance",
          title: title,
          style: {
            fontSize: "12px",
            lineHeight: "20px",
            color: "var(--dsw-alias-label-tertiary)",
            whiteSpace: "nowrap",
            display: "inline-flex",
            alignItems: "center",
          },
        }, indicator, content);
      }

      /**
       * Client plugin body: register the dock entry once the slot declaration
       * is live (slots.inject waits for ui-conversation's declaration).
       */
      function apply(ctx) {
        ctx.slots.inject("conversation.composer.dock", function () {
          return ctx.slots.register({
            name: "conversation.composer.dock",
            id: "deepseek-balance",
            // Leftmost: before the stats line (order 0).
            order: -10,
            inject: function () {
              return {
                loadBalance: function (signal) {
                  // Gateway SRC fallback endpoint: namespace/method on the
                  // shared /api channel; payload must be exactly { args }.
                  // The signal lets the fetch loop abort hung attempts.
                  return ctx.connection.rpc.call("/api", "deepseekBalance/get", { args: {} }, signal);
                },
              };
            },
          }, BalanceDock);
        });
        // Inject the one-line layout style for the plugin's lifetime; the tag
        // is removed on unload (re-injection after reload is idempotent).
        ctx.effect(function () {
          if (typeof document === "undefined") return
          var tagId = "deepseek-balance/dock-row.css"
          var existing = document.querySelector('style[data-plugin-css="' + tagId + '"]')
          if (existing !== null) return
          var tag = document.createElement("style")
          tag.dataset.plugin = "deepseek-balance"
          tag.dataset.pluginCss = tagId
          tag.textContent = DOCK_ROW_CSS
          document.head.appendChild(tag)
          return function () {
            var node = document.querySelector('style[data-plugin-css="' + tagId + '"]')
            if (node !== null && node.parentNode !== null) node.parentNode.removeChild(node)
          }
        })
      }

      exports.BalanceDock = BalanceDock;
      exports.apply = apply;
      exports.inject = inject;
      return module.exports;
    },
  });
})();
