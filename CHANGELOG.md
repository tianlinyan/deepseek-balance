# Changelog

本项目的所有显著变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

## [0.1.0] - 2026-08-14

### 新增

- **余额显示**：在 DSH Web GUI 编辑框（composer）下方的 `conversation.composer.dock` 区域显示 DeepSeek 账户**总余额**（`total_balance`），与内置统计行同排、位于最前。
- **高峰时段状态灯**：余额前显示状态圆点——🔴 北京时间高峰时段（09:00–12:00、14:00–18:00，半开区间），🟢 空闲时段。判定始终以 `Asia/Shanghai` 时区为准，与浏览器/系统时区无关。
- **自动刷新**：每 60 秒轮询一次余额与状态灯；悬停显示高峰/空闲提示。
- **Host 半（`lib/index.js`）**：注册 `deepseekBalance` TypertRemoteService，暴露 `deepseekBalance/get` 端点；经 `ctx.credentials` 实时解析 `DEEPSEEK_API_KEY`（与聊天模型同源、热更新），调用 DeepSeek 用户余额 API。利用 Gateway SRC fallback，免生成 Typert 产物。
- **浏览器半（`lib/client.js`）**：手写 `window.__ModuleLoader__.load` bundle，仅依赖平台模块 `react`，零构建步骤。
- **独立发布**：包结构（`package.json` peerDependencies + `dsh.client` 声明 + `exports`）、类型声明（`lib/types/*.d.ts`）、MIT License、打包产物经 `npm pack` 验证。

[0.1.0]: https://github.com/tianlinyan/deepseek-balance/releases/tag/v0.1.0
