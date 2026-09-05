# CLAUDE.md

Vue 3 + TypeScript + Vuetify 单页应用骨架。业务方向尚未确定，当前仅为通用架子。

## 常用命令

```bash
npm run dev          # 开发服务器 http://localhost:3000
npm run type-check   # vue-tsc --noEmit
npm run lint         # eslint . --fix
npm run format       # prettier --write src/
npm run build        # type-check + vite build
npm run preview      # 预览 dist/
```

包管理器用 **npm**（本机无 pnpm / yarn）。

---

## ⚠️ 版本约束：不要盲目升级

本项目的依赖版本是**刻意锁定**的，不是偷懒没升。以下约束若被打破会直接导致构建或类型检查失效。

### TypeScript 必须留在 5.x

**不要执行 `npm install typescript@latest`。** 本机 npm registry 上 `typescript` 的 `latest` 是 **7.x**，装上去会同时打断两个环节：

1. **`vue-tsc` 会失效。** TS 7 是 Go 原生重写版，**没有暴露 programmatic API**（官方推迟到 7.1）。`vue-tsc` 依赖进程内嵌入 TS 编译器、把 `.vue` 拆成 script/template/render 虚拟文件来做类型检查——它不是命令行调 `tsc`，所以无法驱动 TS 7。React/Node 这类只在命令行调 `tsc` 的项目不受影响，Vue 受影响。
2. **`typescript-eslint` 会装不上。** 它的 peer 写死 `typescript >=4.8.4 <6.1.0`，从依赖解析层面就排除了 TS 7。

两条是独立的约束，指向同一结论：**留在 `~5.9.3`**。`vue-tsc@3.3.11` 的 peer 是 `>=5.0.0`，两边都满足。

> 何时可以解锁：等 TS 7.1 放出 programmatic API、且 `vue-tsc` 发布适配版本之后。届时需要同时确认 `typescript-eslint` 的 peer 上限也已放宽。

### 其余主版本同样有意停在当前档

| 包 | 本项目 | registry latest | 停留原因 |
|---|---|---|---|
| `vuetify` | 3.13.x | 4.x | v4 是全新大版本，生态与文档尚未跟上 |
| `vue-router` | 4.6.x | 5.x | 与 Vuetify 3 一同保持在成熟档 |
| `vite` | 7.3.x | 8.x | 配套插件在 7 上验证过 |
| `typescript` | 5.9.x | 7.x | 见上，硬约束 |

升级任意一项前，先跑 `npm run type-check && npm run build` 确认没崩。

---

## ⚠️ 脚手架陷阱

如果需要重新初始化或参考官方脚手架，注意区分三个名字相近的包：

- `create-vuetify`（`npm create vuetify`）—— **正确的** Vuetify Material 脚手架。但它是**纯交互式向导，没有 `--preset` 之类的非交互参数**（官方仓库相关 issue 至今未解决），在非交互 shell（CI、agent）里会直接挂起。本项目因此是手写搭建的。
- `create-vuetify0`（`npm create vuetify0`）/ `@vuetify/cli` —— **不要用。** 它们脚手架的是 `@vuetify/v0`，即 "headless, unstyled Vue 3 primitives"（无样式基元库），**不是** Vuetify Material 组件库。它会提示你选 UnoCSS/Tailwind 作为 CSS 方案——看到这个提示就说明走错路了。

---

## 项目结构

```
src/
├─ main.ts                 # createApp + 注册 router / vuetify
├─ App.vue                 # <v-app> 外壳
├─ plugins/vuetify.ts      # createVuetify：mdi 图标集 + light/dark 主题
├─ router/index.ts         # 路由表 + afterEach 设置 document.title
├─ layouts/DefaultLayout.vue  # app bar + 抽屉 + 主题切换，含 <v-main>
├─ views/                  # 页面级组件
└─ styles/settings.scss    # Vuetify SASS 变量覆盖入口
```

约定：

- **路径别名 `@/` 指向 `src/`**，在 `vite.config.ts` 和 `tsconfig.json` 两处都配了，改动需同步。
- **Vuetify 组件按需自动引入**（`vite-plugin-vuetify` 的 `autoImport`），模板里直接写 `<v-btn>` 即可，不用手动 import 或注册。
- **`import 'vuetify/styles'` 会被插件重写到 `src/styles/settings.scss`**，定制 SASS 变量改那个文件，不要另开入口。
- 带布局的页面挂在 `DefaultLayout` 的 `children` 下；404 页是顶层路由，**故意不套布局**（无 app bar）。

## 尚未引入

**Pinia**（状态管理）和 **Vitest**（测试）都没装。需要时再加，别默认它们存在。
