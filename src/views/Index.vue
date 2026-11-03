<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { usePidStore } from '@/stores/pid'
import { useToastStore } from '@/stores/toast'
import DebugLogView from './DebugLogView.vue'
import PidMonitorView from './PidMonitorView.vue'

const pidStore = usePidStore()
const toast = useToastStore()
const settingsDialogOpen = ref(false)
const activeTabStorageKey = 'pid-viewer.active-tab'
const activeTab = ref<'monitor' | 'logs'>(
  localStorage.getItem(activeTabStorageKey) === 'logs' ? 'logs' : 'monitor',
)

watch(activeTab, (tab) => localStorage.setItem(activeTabStorageKey, tab))

const statusLabels = {
  unsupported: '浏览器不支持串口',
  disconnected: '未连接',
  connecting: '正在连接',
  discovering: '正在读取 PID',
  connected: '已连接',
  error: '连接错误',
} as const

async function toggleConnection() {
  if (pidStore.connected) {
    const disconnected = await pidStore.disconnect()
    if (disconnected) toast.show('串口已断开')
    else toast.show(pidStore.errorMessage || '断开串口失败', 'error')
  } else {
    await pidStore.connect()
    if (pidStore.connected) toast.show('串口已连接', 'success')
  }
}

watch(
  () => pidStore.connectionStatus,
  (status) => {
    if (status === 'error') toast.show(pidStore.errorMessage || '串口连接错误', 'error')
  },
)

onBeforeUnmount(() => {
  pidStore.setTestMode(false)
  void pidStore.disconnect()
})
</script>

<template>
  <v-app-bar color="primary">
    <v-tabs v-model="activeTab" aria-label="工作台页面" density="compact">
      <v-tab value="monitor" aria-controls="pid-monitor-panel">PID 监视</v-tab>
      <v-tab value="logs" aria-controls="debug-log-panel">调试日志</v-tab>
    </v-tabs>
    <v-spacer />
    <v-chip class="mr-2 d-none d-sm-inline-flex" size="small" variant="outlined">
      {{ pidStore.testMode ? '测试模式' : statusLabels[pidStore.connectionStatus] }}
    </v-chip>
    <v-btn
      :disabled="pidStore.connectionStatus === 'unsupported'"
      :loading="pidStore.busy"
      :prepend-icon="pidStore.connected ? 'mdi-lan-disconnect' : 'mdi-usb-port'"
      :aria-label="pidStore.connected ? '断开串口' : '连接串口'"
      :title="pidStore.errorMessage || statusLabels[pidStore.connectionStatus]"
      variant="text"
      @click="toggleConnection"
    >
      <span class="d-none d-sm-inline">{{ pidStore.connected ? '断开' : '连接串口' }}</span>
    </v-btn>
    <v-btn
      icon="mdi-cog-outline"
      aria-label="打开设置"
      title="设置"
      variant="text"
      @click="settingsDialogOpen = true"
    />
  </v-app-bar>

  <v-main>
    <v-tabs-window v-model="activeTab">
      <v-tabs-window-item
        id="pid-monitor-panel"
        value="monitor"
        role="tabpanel"
        aria-label="PID 监视"
        :transition="false"
        :reverse-transition="false"
      >
        <PidMonitorView />
      </v-tabs-window-item>
      <v-tabs-window-item
        id="debug-log-panel"
        value="logs"
        role="tabpanel"
        aria-label="调试日志"
        :transition="false"
        :reverse-transition="false"
      >
        <DebugLogView :active="activeTab === 'logs'" />
      </v-tabs-window-item>
    </v-tabs-window>
  </v-main>

  <SettingsDialog v-model="settingsDialogOpen" />
</template>
