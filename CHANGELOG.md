# Changelog

本项目的所有显著变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.5] - 2026-08-22

### 变更

- **（浏览器半 `lib/client.js`）高峰时段判定跟随 DeepSeek 最新峰谷计费规则**：自北京时间 2026-08-23（周日）00:00 起，周末（周六、周日）全天不再区分峰谷时段，统一按低谷时段价格计费。状态灯与悬停提示据此更新——周末整天保持 🟢（低谷时段），仅工作日（周一至周五）09:00–12:00、14:00–18:00 显示 🔴 高峰时段。新增 `isBeijingWeekend()`，判定仍以 `Asia/Shanghai` 时区为准，与浏览器/系统时区无关。
- **（库 `package.json` / `README.md`）版本与说明同步**：版本升至 `0.1.5`，描述与 README 的高峰/低谷时段说明同步更新，README 安装/升级命令中的固定标签改为 `#v0.1.5`。

## [0.1.4] - 2026-08-22

### 修复

- **LICENSE 由 UTF-16LE 转回 UTF-8（无 BOM）**：此前 LICENSE 带 UTF-16 BOM，会被文本工具与许可证识别/扫描误判为二进制或"无许可证文件"，现为标准的 UTF-8 文本。

### 变更

- **（宿主半 `lib/index.js`）`BALANCE_URL` 支持环境变量覆盖**：新增 `balanceUrl()`，按请求读取 `process.env.BALANCE_URL`，空/缺失回退内置端点，代理地址变更无需重启；README 配置节同步更新。
- **（浏览器半 `lib/client.js`）`classifyCarrier` 更健壮**：新增 `looksLikeBalancePayload` 与 `classifyPayload`，同时接受 Gateway 返回的"已包装 `{ok, value|error}`"与"未包装的载荷"两种形状，避免未来网关改版时把成功误判为失败；并把非 `invocation-unavailable` 的已解析网关失败归类为确定性业务错误（直接提示），而 `invocation-unavailable`（端点认领竞态）仍走瞬态快速重试，不影响 v0.1.3 的启动竞态处理。
- **（库 `lib/types`）补齐类型声明**：`index.d.ts` 声明 `API_KEY_REF` / `BALANCE_URL` / `BALANCE_TIMEOUT_MS`；`client/index.d.ts` 的 `loadBalance` 补上 `signal?: AbortSignal` 形参。

### 开发

- **引入无依赖回归/一致性测试**：新增 `test/health.test.mjs`（`node --test`），覆盖 LICENSE 编码、package/README/CHANGELOG 版本一致、`loadBalance` 签名、宿主导出 seam；`npm test` 现在 = 语法检查 + 测试。
- **新增 `.github/workflows/ci.yml`**：在 push/PR 上对 Node 22/24 跑 `npm test`。
- **仓库卫生**：`scratch/` 一次性调试脚本已从 git 追踪移除并加入 `.gitignore`，避免进入分发路径。

## [0.1.3] - 2026-08-22

### 修复

- **取数生命周期脱离 React（浏览器半 `lib/client.js`）**：修复"刷新页面后余额长时间停留在'查询中…'"的问题。此前取数循环挂在组件 effect 上，页面加载后 slot 注入面身份变化（会话恢复、provider roster 变化导致的重新物化）会触发 effect 重跑，把刚显示的余额瞬间覆盖回"查询中…"并作废在途请求，可能持续 1 分钟以上。现改为**模块级单飞取数循环 + `useSyncExternalStore` 订阅**：循环与组件生命周期解耦，重挂载/重渲染只刷新最新注入面，不再重置视图；每次请求带 6 秒超时并 `AbortController` 中止悬挂请求；传输失败指数退避（3s→6s→12s→15s，阶梯重置）后台静默重试。
- **上次余额本地缓存（`localStorage`）**：成功获取的余额持久化，刷新后**立即显示上次余额**（带"上次获取，后台刷新中"悬停提示），后台静默刷新，不再出现"查询中…"占位；缓存 24 小时内有效。业务性错误（如 API Key 未配置）仍即时显示，不会被缓存掩盖。

## [0.1.2] - 2026-08-22

### 变更

- **失败指数退避与边界处理（浏览器半 `lib/client.js`）**：传输层失败（超时/网络错误）改为指数退避重试（3s → 6s → 12s → 15s 封顶，成功后重置；达到封顶后**阶梯重置**，保证端点恢复后 3–15s 内再次尝试），替代"固定 3s 快速重试 + 60s 等待"；连续 3 次失败后显示"余额请求失败，稍后自动重试"，后台继续重试。同时补强边界处理：`is_available=false` 显示"余额服务不可用"；对 `balance_infos` 为空、条目非对象、`total_balance` 非数字/非数值字符串等畸形载荷做守卫（显示"余额数据为空"而不是渲染脏数据）。

## [0.1.1] - 2026-08-22

### 修复

- **首查快速重试（浏览器半 `lib/client.js`）**：修复重启服务/刷新页面后余额可能长时间停留在"查询中…"的问题。每次余额请求增加 6 秒超时上限；传输层未就绪（超时或网络错误）时每 3 秒自动重试（最多 8 次），传输就绪后余额数秒内即可显示，无需等到 60 秒的自动刷新周期。业务性错误（如 API Key 未配置）仍即时显示，不触发快速重试。

## [0.1.0] - 2026-08-14

### 新增

- **余额显示**：在 DSH Web GUI 编辑框（composer）下方的 `conversation.composer.dock` 区域显示 DeepSeek 账户**总余额**（`total_balance`），与内置统计行同排、位于最前。
- **高峰时段状态灯**：余额前显示状态圆点——🔴 北京时间高峰时段（09:00–12:00、14:00–18:00，半开区间），🟢 空闲时段。判定始终以 `Asia/Shanghai` 时区为准，与浏览器/系统时区无关。
- **自动刷新**：每 60 秒轮询一次余额与状态灯；悬停显示高峰/空闲提示。
- **Host 半（`lib/index.js`）**：注册 `deepseekBalance` TypertRemoteService，暴露 `deepseekBalance/get` 端点；经 `ctx.credentials` 实时解析 `DEEPSEEK_API_KEY`（与聊天模型同源、热更新），调用 DeepSeek 用户余额 API。利用 Gateway SRC fallback，免生成 Typert 产物。
- **浏览器半（`lib/client.js`）**：手写 `window.__ModuleLoader__.load` bundle，仅依赖平台模块 `react`，零构建步骤。
- **独立发布**：包结构（`package.json` peerDependencies + `dsh.client` 声明 + `exports`）、类型声明（`lib/types/*.d.ts`）、MIT License、打包产物经 `npm pack` 验证。

[0.1.5]: https://github.com/tianlinyan/deepseek-balance/releases/tag/v0.1.5
[0.1.4]: https://github.com/tianlinyan/deepseek-balance/releases/tag/v0.1.4
[0.1.3]: https://github.com/tianlinyan/deepseek-balance/releases/tag/v0.1.3
[0.1.2]: https://github.com/tianlinyan/deepseek-balance/releases/tag/v0.1.2
[0.1.1]: https://github.com/tianlinyan/deepseek-balance/releases/tag/v0.1.1
[0.1.0]: https://github.com/tianlinyan/deepseek-balance/releases/tag/v0.1.0
