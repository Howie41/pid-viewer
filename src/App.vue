<script setup lang="ts">
import AppToastStack from '@/components/AppToastStack.vue'
</script>

<template>
  <v-app>
    <router-view />
    <AppToastStack />
  </v-app>
</template>
