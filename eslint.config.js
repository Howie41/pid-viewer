import js from '@eslint/js'
// skip-formatting: 只关掉与 Prettier 冲突的规则，不把 Prettier 当成 ESLint 规则来跑
// （格式化交给 `npm run format` / 编辑器，ESLint 只管代码质量，速度更快）
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    name: 'app/ignores',
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },

  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue,js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  {
    // .vue 的 <script lang="ts"> 需要显式把 TS parser 挂到 vue-eslint-parser 内部
    name: 'app/vue-ts-parser',
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },

  {
    name: 'app/rules',
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
    },
  },

  skipFormatting,
)
