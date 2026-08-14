# deepseek-balance

DeepSeek 账户余额显示插件，用于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web GUI。

在编辑框（composer）下方的 dock 区域显示当前 DeepSeek 账户总余额，并带一个**高峰时段状态灯**（按北京时间判断）：

```
🟢/🔴 DeepSeek 余额: CNY 116.09 | 2 轮 · 161 步 | LLM 31m55s · ...
```

- 🔴 **高峰时段**（北京时间 09:00–12:00、14:00–18:00，半开区间，12:00/18:00 整点不计入）
- 🟢 **空闲时段**（其余时间）

指示灯始终以**北京时间**（`Asia/Shanghai`）为准，与浏览器/系统时区无关——无论你在哪个时区，判定结果一致。

## 特性

- 只显示**总余额**（`total_balance`），简洁一行
- 每 **60 秒**自动刷新，无需手动操作
- 状态灯按 DeepSeek 官方峰谷定价通告的时段规则（[DeepSeek API 峰谷定价](https://www.ithome.com/0/989/418.htm)）
- 悬停显示当前是高峰/空闲时段的提示
- Host 端利用 Gateway **SRC fallback**，免生成 Typert 产物；浏览器半为手写 bundle，**零构建步骤**

## 安装

### 方式一：`dsh plugin`（推荐）

在 DSH 安装目录执行：

```sh
dsh plugin --profile web add deepseek-balance
```

然后编辑 `$DSH_HOME/profiles/web/cordis.patch.yml`，追加：

```yaml
- insert:
    - id: deepseek-balance
      name: 'deepseek-balance'
```

刷新浏览器页面生效。

### 方式二：手动链接

将本包链接到 web profile 的 node_modules：

```powershell
New-Item -ItemType Junction -Path "$HOME\.dsh\profiles\web\node_modules\deepseek-balance" -Target "<本包路径>"
```

再按方式一追加 `cordis.patch.yml` 条目。

## 配置

- **API key**：与聊天模型共用 `DEEPSEEK_API_KEY` 凭证（Models 页或环境变量配置），无需单独设置。Host 端每次请求通过 `ctx.credentials` 实时解析，key 变更后 60 秒内生效。
- 可选：将 `lib/index.js` 中的 `BALANCE_URL` 替换为代理地址。

## 卸载

1. 删除 `cordis.patch.yml` 中追加的 `deepseek-balance` 条目；
2. 移除 node_modules 链接：
   ```powershell
   Remove-Item "$HOME\.dsh\profiles\web\node_modules\deepseek-balance" -Recurse -Force
   ```
3. 刷新浏览器页面。

## 开发

```sh
# 语法检查
npm run check

# 打包预览（不发布）
npm pack --dry-run

# 发布（需先 npm login，包名需在 registry 可用）
npm publish
```

### 结构

```
deepseek-balance/
├── package.json          # dsh.client 声明 + exports + peerDependencies
├── lib/
│   ├── index.js          # Host 半：DeepSeekBalanceService（免构建）
│   ├── client.js         # 浏览器半：手写 dock 条目 bundle
│   └── types/            # 类型声明
├── LICENSE
└── README.md
```

### 注意

- **Peer 依赖**：`react`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-credentials`、`@deepseek-ai/dsh-typert-protocol` 由宿主 DSH 提供，声明为 `peerDependencies`，请勿打包进发布产物。
- **端点命名空间**固定为 `deepseekBalance`；如与其他插件冲突，改 `lib/index.js` 中 `super(ctx, 'deepseekBalance')` 的 key 并同步 client 的 endpoint 字符串。
- 本包为纯 JS，无构建步骤；`lib/types/*.d.ts` 仅供 TS 消费者参考。

## License

[MIT](LICENSE)
