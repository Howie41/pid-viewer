# AGENTS.md

PID Viewer 是一个 Vue 3 + TypeScript + Vuetify 单页应用，用于显示下位机 PID 实例的串口监视数据。协议定义与字段语义以 `docs/data-frame.md` 为准。

## 环境与命令

- 包管理器：仅使用 **npm**。
- Node.js：`>=20.19.0`。
- 本机没有 pnpm / yarn，不要改用其他包管理器。

```bash
npm run dev          # 开发服务器 http://localhost:3000
npm run type-check   # vue-tsc --noEmit
npm run lint         # eslint . --fix（会修改文件）
npm run format       # prettier --write src/
npm run build        # type-check + vite build
npm run preview      # 预览 dist/
```

修改代码后至少运行：

```bash
npm run type-check
npm run build
```

针对少量文件只检查、不自动修复时，可直接调用本地 ESLint：

```bash
.\node_modules\.bin\eslint.cmd src\path\to\file.vue
```

## 技术栈

| 类别 | 当前实现 |
| --- | --- |
| UI 框架 | Vue 3.5 + Vuetify 3.13 |
| 语言 | TypeScript 5.9，严格模式 |
| 构建 | Vite 7.3 + `@vitejs/plugin-vue` |
| 路由 | Vue Router 4.6 |
| 状态管理 | Pinia 4 |
| 图表 | ECharts 6，按模块注册 |
| 图标 | Material Design Icons (`@mdi/font`) |
| 样式预处理 | Sass |
| 代码质量 | ESLint 9 flat config + Prettier 3 |

当前没有引入 Vitest 或其他测试框架。不要假设测试命令或测试工具已经存在。

## 版本约束：不要盲目升级

依赖版本是有意保持在当前主版本的。升级前必须同时检查 peer dependency，并运行 `npm run type-check && npm run build`。

### TypeScript 必须保留在 5.x

不要执行 `npm install typescript@latest`。项目固定使用 `~5.9.3`，原因有两项：

1. `vue-tsc@3.3.11` 依赖 TypeScript 的 programmatic API 来处理 `.vue` 虚拟文件。
2. 当前 `typescript-eslint` 的 peer dependency 不接受不兼容的 TypeScript 主版本。

只有在 `vue-tsc` 和 `typescript-eslint` 都明确支持新主版本后，才允许升级 TypeScript。

### 其他主版本

- Vuetify 保持 3.x，不要直接升级到 4.x。
- Vue Router 保持 4.x，不要直接升级到 5.x。
- Vite 保持 7.x，升级主版本前检查 Vue 与 Vuetify 插件兼容性。

### Vuetify 脚手架陷阱

- `create-vuetify`（`npm create vuetify`）才是 Vuetify Material 脚手架，但它是交互式向导，不适合无交互 shell。
- 不要使用 `create-vuetify0` 或 `@vuetify/cli`；它们面向 `@vuetify/v0` 的无样式基元，并非本项目使用的 Vuetify Material 组件库。

## 项目结构

```text
src/
├─ main.ts                         # 注册 router、Pinia、Vuetify 和 MDI 字体
├─ App.vue                         # 根 <v-app> 与 <router-view>
├─ components/
│  ├─ DarkModeButton.vue           # Vuetify 明暗主题切换
│  └─ PidChannelChart.vue          # 单通道 ECharts 卡片
├─ plugins/
│  └─ vuetify.ts                   # 图标集与 light/dark 主题
├─ protocol/
│  └─ pidProtocol.ts               # PID 帧编解码、CRC 与接收解析器
├─ router/
│  └─ index.ts                     # 首页、404 与 document.title
├─ services/
│  └─ pidSerialTransport.ts        # Web Serial 连接与字节流读写
├─ stores/
│  └─ pid.ts                       # PID 实例、通道历史与连接状态
├─ styles/
│  └─ settings.scss                # Vuetify SASS 变量入口
└─ views/
   ├─ Index.vue                    # Appbar、四通道网格与模拟采样定时器
   └─ NotFoundView.vue             # 404 页面

docs/
└─ data-frame.md                   # PID 串口帧协议
```

项目当前没有 `layouts/DefaultLayout.vue`。Appbar 位于 `Index.vue`，404 页面不包含首页 Appbar。

## 代码与配置约定

### Vue 与 TypeScript

- Vue 组件使用 `<script setup lang="ts">`。
- TypeScript 开启严格模式、未使用变量检查和 bundler 模块解析。
- 类型导入使用 `import type`，与 `verbatimModuleSyntax` 保持兼容。
- 路径别名 `@/` 指向 `src/`，配置分布在 `vite.config.ts` 与 `tsconfig.json`；修改时必须同步。

### Vuetify 优先

- 页面布局、间距、响应式、卡片、按钮和主题优先使用 Vuetify 组件、props 与工具类。
- 能用 `v-container`、`v-row`、`v-col`、`v-card`、`v-responsive` 或 Vuetify 工具类完成的内容，不要手写 CSS。
- Vuetify 组件由 `vite-plugin-vuetify` 自动按需引入；模板中直接使用，不要手动 import 或注册。
- `import 'vuetify/styles'` 会经插件重写到 `src/styles/settings.scss`。全局 Vuetify SASS 变量只在该入口配置，不要新增平行入口。
- MDI 图标集已经配置，优先使用 `mdi-*` 图标名。

### ECharts

- 使用 `echarts/core` 并显式注册所需组件、图表和渲染器，避免改为全量 ECharts 导入。
- `PidChannelChart.vue` 负责单个图表的初始化、更新、暂停快照、`dataZoom` 时间选择、尺寸监听和销毁。
- ECharts 实例必须在组件卸载时 `dispose()`，事件监听和 `ResizeObserver` 也必须清理。
- 页面层只负责组织通道和提供数据，不要把单图表生命周期重新放回 `Index.vue`。

### Pinia

- Pinia 已在 `main.ts` 注册。
- `stores/pid.ts` 是 PID 实例、四个监视通道、采样历史与串口连接状态的唯一数据源。
- 协议编解码和 Web Serial 流管理必须留在独立 `.ts` 文件中，Vue 组件只读取状态和调用 store action。
- 串口连接由 `Index.vue` 触发，页面卸载时必须断开并释放流锁。

### 格式化与 lint

- Prettier：无分号、单引号、100 列、2 空格、尾逗号、LF。
- ESLint 负责代码质量，不运行 Prettier 规则。
- `npm run lint` 带 `--fix`，运行前注意它会修改整个项目内的匹配文件。

## PID 协议约定

协议细节不要凭 UI 代码推断，以 `docs/data-frame.md` 为唯一来源。实现时特别注意：

- 最多同时监视 4 个通道，通道编号为 `0~3`。
- 每个通道绑定一个 `Pid_Id`；未使用通道必须使用 `0xFF`。
- `MONITOR` 帧为每个通道提供 `Pid_Id`、`ref` 和 `out`。
- `Timestamp` 是毫秒单位的 RTOS tick。
- 多字节值使用 Little-Endian；浮点数使用 IEEE 754 `float32`。
- CRC 使用 `CRC-16/CCITT-FALSE`，发送时为 Little-Endian。
- 不要直接序列化 C/C++ 结构体。

每个通道必须维护独立的 `ref/out` 历史，不要把同一组数据复制成四个通道。连接后，应用会依次读取 PID 实例，并把最前面的四个实例绑定到监视通道；不足四个时用 `0xFF` 补齐。

## 修改边界

- 不要无关升级依赖或重建脚手架。
- 不要假设不存在的布局、测试框架或串口实现。
- 修改协议字段、帧长度或 CRC 行为前，先同步更新并核对 `docs/data-frame.md`。
- 保持首页结构简单：顶部 Appbar，下方四通道图表网格；额外界面元素应由明确需求驱动。
