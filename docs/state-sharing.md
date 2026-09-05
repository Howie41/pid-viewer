# 组件间共享状态方案

## 问题

在 [Index.vue](../src/views/Index.vue) 里想写：

```vue
<v-list-subheader>设置 {{ isDark }}</v-list-subheader>
```

但 `isDark` 定义在另一个组件 [DarkModeButton.vue](../src/components/DarkModeButton.vue) 的 `<script setup>` 里：

```ts
const isDark = ref(isSystemDarkMode())
```

Vue 里 `<script setup>` 定义的变量**默认是组件私有的**，父组件 `Index.vue` 无法直接读到 `DarkModeButton.vue` 里的 `isDark`。要跨组件共享，本质上有两条路：

1. **把状态「往上提」** —— 让父组件（或更上层的共享层）成为状态的唯一拥有者，子组件通过 props 接收、通过 emit 上报。
2. **把状态「下沉到共享层」** —— 抽成独立模块（composable / store），所有组件 import 同一份。

下面按推荐度给出四套可落地的方案，均以当前项目文件为准。

---

## 方案 1：提取 composable 共享单例状态（推荐）

**思路**：把主题状态抽成一个 composable，用**模块级 `ref`** 保存。模块在应用里只会被求值一次，所以所有 `import` 它的组件拿到的都是**同一个 ref 实例**，天然共享。

### 1. 新建 `src/composables/useThemeMode.ts`

```ts
import { ref } from 'vue'
import { useTheme } from 'vuetify'

const theme = useTheme()
const isDark = ref(isSystemDarkMode()) // 模块级 ref：全局共享

function isSystemDarkMode() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function setDarkMode(dark: boolean) {
  isDark.value = dark
  theme.change(isDark.value ? 'dark' : 'light')
}

function toggleTheme() {
  setDarkMode(!isDark.value)
}

setDarkMode(isSystemDarkMode()) // 模块加载即按系统偏好初始化一次

export function useThemeMode() {
  return { isDark, toggleTheme, setDarkMode }
}
```

> 关键点：`const isDark = ref(...)` 写在 `useThemeMode()` 函数**外面**（模块作用域）。如果写进函数内部，每次调用都会 new 一个独立 ref，就共享不了了。

### 2. 改写 `DarkModeButton.vue`

```vue
<template>
  <v-btn
    :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
    :aria-label="isDark ? '切换到浅色主题' : '切换到深色主题'"
    @click="toggleTheme"
  />
</template>

<script setup lang="ts">
import { useThemeMode } from '@/composables/useThemeMode'

const { isDark, toggleTheme } = useThemeMode()
</script>
```

### 3. 改写 `Index.vue`

```vue
<script setup lang="ts">
import { ref } from 'vue'
import DarkModeButton from '@/components/DarkModeButton.vue'
import { useThemeMode } from '@/composables/useThemeMode'

const { isDark } = useThemeMode()

const drawer = ref(true)
// ...其余不变
</script>
```

模板里 `{{ isDark }}` 就能直接用了。

**优点**：零新依赖；主题本来就是全局单例，语义最贴切；任意深度的组件都能 `useThemeMode()` 共享。

**缺点**：状态是「隐藏的单例」，数据流不如 props 显式，单测时需要注意模块级状态的隔离。

---

## 方案 2：状态提升 + props/emit

**思路**：把 `isDark` 的状态和切换逻辑**全部移到父组件 `Index.vue`**，子组件 `DarkModeButton` 退化成纯展示组件：父传值、子发事件。

### 1. 改写 `DarkModeButton.vue`（纯展示）

```vue
<template>
  <v-btn
    :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
    :aria-label="isDark ? '切换到浅色主题' : '切换到深色主题'"
    @click="emit('toggle')"
  />
</template>

<script setup lang="ts">
defineProps<{ isDark: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
</script>
```

### 2. 改写 `Index.vue`（成为状态拥有者）

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useTheme } from 'vuetify'
import DarkModeButton from '@/components/DarkModeButton.vue'

const theme = useTheme()
const isDark = ref(isSystemDarkMode())

function isSystemDarkMode() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}
function setDarkMode(dark: boolean) {
  isDark.value = dark
  theme.change(isDark.value ? 'dark' : 'light')
}
function toggleTheme() {
  setDarkMode(!isDark.value)
}

const drawer = ref(true)
// ...其余不变
</script>

<template>
  <!-- app bar 里 -->
  <DarkModeButton :is-dark="isDark" @toggle="toggleTheme" />
  <!-- ... -->
</template>
```

**优点**：数据单向流动、来源清晰；父组件是唯一状态拥有者，符合 Vue 官方推荐范式。

**缺点**：状态和逻辑在 `Index.vue` 里膨胀；如果将来有更深的组件也要 `isDark`，得继续往下逐层透传 props（prop drilling）。

---

## 方案 3：直接复用 Vuetify 自带的 `useTheme()`

**思路**：`DarkModeButton` 里已经在调用 `theme.change('dark'/'light')`，所以 Vuetify 的 `theme` 本身就是全局可读的。`Index.vue` 里直接 `useTheme()` 读当前主题，不再需要额外的 `isDark` ref。

### 只改 `Index.vue`

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useTheme } from 'vuetify'
import DarkModeButton from '@/components/DarkModeButton.vue'

const theme = useTheme()

const drawer = ref(true)
// ...其余不变
</script>
```

模板里把 `{{ isDark }}` 换成：

```vue
<v-list-subheader>设置 {{ theme.global.current.value.dark }}</v-list-subheader>
```

（也可以写 `theme.global.name.value === 'dark'`，按需二选一。）

**优点**：零新增状态，代码最少。

**缺点**：
- 语义变化：`theme.global.current.value.dark` 表达的是「当前是否为深色主题」，与 `DarkModeButton` 里那个额外跟踪系统偏好的 `isDark` 不完全等价。
- 若想彻底统一，需要把 `DarkModeButton` 里的系统偏好逻辑也迁走，否则两处状态并存、可能短暂不一致。

---

## 方案 4：引入 Pinia

**思路**：用官方状态管理库 Pinia，把主题状态放进全局 store。

> 注意：CLAUDE.md 明确 Pinia **尚未引入**，且项目遵循「版本锁定」约定——本方案只**新增** `pinia` 依赖，不要动其它已有依赖的版本。

### 1. 安装并注册

```bash
npm install pinia
```

[main.ts](../src/main.ts)：

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from '@/App.vue'
import vuetify from '@/plugins/vuetify'
import router from '@/router'

import '@mdi/font/css/materialdesignicons.css'

createApp(App).use(router).use(createPinia()).use(vuetify).mount('#app')
```

### 2. 新建 `src/stores/theme.ts`

```ts
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useTheme } from 'vuetify'

export const useThemeStore = defineStore('theme', () => {
  const theme = useTheme()
  const isDark = ref(isSystemDarkMode())

  function isSystemDarkMode() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  function setDarkMode(dark: boolean) {
    isDark.value = dark
    theme.change(isDark.value ? 'dark' : 'light')
  }
  function toggleTheme() {
    setDarkMode(!isDark.value)
  }

  return { isDark, toggleTheme, setDarkMode }
})
```

### 3. 两个组件各自取 store

`DarkModeButton.vue`：

```ts
import { useThemeStore } from '@/stores/theme'
const { isDark, toggleTheme } = useThemeStore()
```

`Index.vue`：

```ts
import { useThemeStore } from '@/stores/theme'
const { isDark } = useThemeStore()
```

**优点**：规模化最稳；DevTools 可调试；后续有更多跨组件状态时不用重复造轮子。

**缺点**：为单个布尔值引入一个依赖，略重；需要改 `main.ts` 注册。

---

## 不推荐方案（简述）

- **`defineExpose` + template ref**：子组件 `defineExpose({ isDark })`，父组件 `<DarkModeButton ref="btn" />` 后读 `btn.value.isDark`。能拿到值，但把内部实现暴露给父组件、破坏封装，也不适合用来驱动响应式渲染。只适合暴露命令式方法（如 `focus()`）。
- **事件总线（mitt 等）**：全局发事件同步状态。对「父读子状态」这种简单场景属于过度设计，且失去响应式的可追踪性。

---

## 选型建议

| 场景 | 推荐 |
| --- | --- |
| 只有一处布尔值、想最快落地 | 方案 1 或 3 |
| 数据流要显式、父子关系清晰 | 方案 2 |
| 主题/语言/登录态等真正的全局状态 | 方案 1（轻量）或 4（要规模化/DevTools） |
| 后续会有大量跨组件共享状态 | 方案 4 |

当前 `isDark` 是「主题」这个全局单例，最贴合的是 **方案 1**（抽 composable）或 **方案 3**（复用 Vuetify 主题）；若只是教学/最小改动，**方案 2** 的显式数据流最容易理解。
