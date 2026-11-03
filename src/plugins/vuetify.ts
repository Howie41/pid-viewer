import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi'

// 该导入会被 vite-plugin-vuetify 重写到 src/styles/settings.scss
import 'vuetify/styles'

export const themePreferenceStorageKey = 'pid-viewer.theme'
const savedTheme = localStorage.getItem(themePreferenceStorageKey)

export default createVuetify({
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi },
  },
  theme: {
    defaultTheme: savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'system',
    themes: {
      light: {
        dark: false,
        colors: {
          primary: '#1867C0',
          secondary: '#5CBBF6',
        },
      },
      dark: {
        dark: true,
        colors: {
          primary: '#2196F3',
          secondary: '#54B6B2',
        },
      },
    },
  },
})
