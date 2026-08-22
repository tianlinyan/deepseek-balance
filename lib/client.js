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
      var useState = React.useState;
      var useEffect = React.useEffect;
      var useCallback = React.useCallback;
      var useRef = React.useRef;
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
      /** Consecutive transport misses before a failure message shows; retries keep running in the background. */
      var MAX_CONSECUTIVE_MISSES = 3;

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
       * Whether the current moment falls inside a DeepSeek peak window,
       * measured in Beijing time (Asia/Shanghai): 09:00–12:00 and 14:00–18:00.
       * Half-open intervals: 12:00 and 18:00 sharp count as off-peak.
       * @returns true during peak hours, false otherwise (or when the clock
       * cannot be resolved — safe default is off-peak).
       */
      function isBeijingPeakHour() {
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

      /**
       * BalanceDock: the composer.dock entry. Receives the framework session
       * kit plus the injected `loadBalance` face; owns its own fetch lifecycle
       * with a 60-second ambient refresh. A status dot precedes the label:
       * red during Beijing peak hours (09–12, 14–18), green otherwise.
       *
       * Boot-race handling: right after a page load or host restart the
       * transport may not be ready yet and the first RPC can hang. Every
       * attempt is bounded by FETCH_TIMEOUT_MS; a transport-layer miss
       * (timeout or network error) is retried with exponential backoff
       * (RETRY_BASE_MS doubling, capped at RETRY_MAX_MS, ladder restarted
       * after MAX_BACKOFF_STEPS misses), so the balance appears as soon as
       * the transport is warm instead of waiting for the next ambient tick.
       * After MAX_CONSECUTIVE_MISSES a failure message shows while
       * background retries continue; a definitive answer — ready, or a
       * business error such as a missing API key — resets the backoff and
       * refreshes on the ambient cadence.
       */
      function BalanceDock(props) {
        var loadBalance = props.loadBalance;
        var state = useState({ status: "loading" });
        var view = state[0];
        var setView = state[1];

        // Monotonic attempt id: a slow attempt that settles late must not
        // overwrite a newer attempt's result.
        var attemptId = useRef(0);

        /**
         * Render one RPC outcome. Returns true when a definitive view was
         * rendered (ready, or a business failure worth showing), false when
         * the attempt failed at the transport layer (timeout / network error)
         * and a quick retry is worthwhile.
         */
        var renderOutcome = useCallback(function (carrier) {
          if (carrier === null || carrier === undefined) return false;
          // Level 1: the RPC carrier. A non-ok carrier is a transport/assembly failure.
          if (!carrier || carrier.ok !== true) {
            var carrierError = carrier && carrier.error ? carrier.error : {};
            setView({ status: "error", message: carrierError.message || "查询失败" });
            return true;
          }
          // Level 2: the Host's business result.
          var business = carrier.value;
          if (!business || business.ok !== true) {
            var businessError = business && business.error ? business.error : {};
            setView({ status: "error", message: businessError.message || "查询失败" });
            return true;
          }
          var payload = business.value;
          if (payload === null || typeof payload !== "object") {
            setView({ status: "error", message: "余额数据为空" });
            return true;
          }
          // The balance service itself reports unavailable — surface that
          // instead of pretending the payload is a balance.
          if (payload.is_available === false) {
            setView({ status: "error", message: "余额服务不可用" });
            return true;
          }
          var text = totalBalanceText(payload);
          if (text === null) {
            setView({ status: "error", message: "余额数据为空" });
            return true;
          }
          setView({ status: "ready", text: text });
          return true;
        }, [setView]);

        /** One bounded fetch attempt; resolves { settled } with settled=false on a transport miss. */
        var tryOnce = useCallback(function () {
          var id = ++attemptId.current;
          var timer = null;
          var timeout = new Promise(function (_, reject) {
            timer = setTimeout(function () { reject(new Error("timeout")); }, FETCH_TIMEOUT_MS);
          });
          return Promise.race([loadBalance(), timeout]).then(
            function (carrier) {
              if (timer !== null) clearTimeout(timer);
              if (id !== attemptId.current) return { settled: true };
              return { settled: renderOutcome(carrier) };
            },
            function () {
              if (timer !== null) clearTimeout(timer);
              if (id !== attemptId.current) return { settled: true };
              return { settled: false };
            }
          );
        }, [loadBalance, renderOutcome]);

        useEffect(function () {
          var alive = true;
          var timer = null;
          var misses = 0;

          function nextDelay() {
            if (misses === 0) return REFRESH_MS;
            return Math.min(RETRY_BASE_MS * Math.pow(2, misses - 1), RETRY_MAX_MS);
          }

          function attempt() {
            if (!alive) return;
            // Keep "查询中…" until the first failure message; later background
            // retries leave the current view alone unless one succeeds.
            if (misses === 0) setView({ status: "loading" });
            tryOnce().then(function (outcome) {
              if (!alive) return;
              if (outcome.settled) {
                // Definitive answer (ready, or a business error such as a
                // missing API key): reset the backoff, refresh on the ambient
                // cadence.
                misses = 0;
                timer = setTimeout(attempt, REFRESH_MS);
                return;
              }
              // Transport miss: grow the backoff (3s → 6s → 12s → … capped),
              // surface a message once the miss is sustained, and keep trying
              // in the background.
              misses++;
              if (misses === MAX_CONSECUTIVE_MISSES) {
                setView({ status: "error", message: "余额请求失败，稍后自动重试" });
              }
              // Restart the ladder once it has reached its cap, so the next
              // attempt is never far away when the endpoint comes back.
              if (misses > MAX_BACKOFF_STEPS) misses = 1;
              timer = setTimeout(attempt, nextDelay());
            });
          }

          attempt();
          return function () {
            alive = false;
            attemptId.current++;
            if (timer !== null) clearTimeout(timer);
          };
        }, [tryOnce]);

        // Status dot: red during Beijing peak hours (09-12, 14-18), green otherwise.
        var peak = isBeijingPeakHour();
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

        return createElement("div", {
          "data-plugin": "deepseek-balance",
          title: peak ? "DeepSeek 高峰时段（北京时间 9:00-12:00、14:00-18:00）" : "DeepSeek 非高峰时段",
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
                loadBalance: function () {
                  // Gateway SRC fallback endpoint: namespace/method on the
                  // shared /api channel; payload must be exactly { args }.
                  return ctx.connection.rpc.call("/api", "deepseekBalance/get", { args: {} });
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
