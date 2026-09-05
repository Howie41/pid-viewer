<template>
  <v-btn
    :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
    :aria-label="isDark ? '切换到浅色主题' : '切换到深色主题'"
    @click="toggleTheme"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useTheme } from 'vuetify'

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

setDarkMode(isSystemDarkMode())
</script>
