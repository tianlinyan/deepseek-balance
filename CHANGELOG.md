# Changelog

本项目的所有显著变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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

[0.1.2]: https://github.com/tianlinyan/deepseek-balance/releases/tag/v0.1.2
[0.1.1]: https://github.com/tianlinyan/deepseek-balance/releases/tag/v0.1.1
[0.1.0]: https://github.com/tianlinyan/deepseek-balance/releases/tag/v0.1.0
