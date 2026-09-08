<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import DarkModeButton from '@/components/DarkModeButton.vue'
import PidChannelChart from '@/components/PidChannelChart.vue'
import PidInstanceDialog from '@/components/PidInstanceDialog.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { usePidStore } from '@/stores/pid'

const pidStore = usePidStore()
const pidDialogOpen = ref(false)
const settingsDialogOpen = ref(false)
const selectedChannelId = ref<number>()

const statusLabels = {
  unsupported: '浏览器不支持串口',
  disconnected: '未连接',
  connecting: '正在连接',
  discovering: '正在读取 PID',
  connected: '已连接',
  error: '连接错误',
} as const

async function toggleConnection() {
  if (pidStore.connected) await pidStore.disconnect()
  else await pidStore.connect()
}

function getPidName(pidId: number) {
  return pidStore.getInstance(pidId)?.name
}

function openPidSelector(channelId: number) {
  selectedChannelId.value = channelId
  pidDialogOpen.value = true
}

onBeforeUnmount(() => {
  pidStore.setTestMode(false)
  void pidStore.disconnect()
})
</script>

<template>
  <v-app-bar color="primary">
    <v-app-bar-title>PID Viewer</v-app-bar-title>
    <v-spacer />
    <v-chip class="mr-2" size="small" variant="outlined">
      {{ pidStore.testMode ? '测试模式' : statusLabels[pidStore.connectionStatus] }}
    </v-chip>
    <v-btn
      :disabled="pidStore.connectionStatus === 'unsupported'"
      :loading="pidStore.busy"
      :prepend-icon="pidStore.connected ? 'mdi-lan-disconnect' : 'mdi-usb-port'"
      :title="pidStore.errorMessage || statusLabels[pidStore.connectionStatus]"
      variant="text"
      @click="toggleConnection"
    >
      {{ pidStore.connected ? '断开' : '连接串口' }}
    </v-btn>
    <v-btn
      icon="mdi-cog-outline"
      aria-label="打开设置"
      title="设置"
      variant="text"
      @click="settingsDialogOpen = true"
    />
    <DarkModeButton />
  </v-app-bar>

  <v-main>
    <v-container fluid class="pa-3">
      <v-row dense>
        <v-col v-for="channel in pidStore.channels" :key="channel.id" cols="12" md="6">
          <PidChannelChart
            :channel-id="channel.id"
            :can-select-pid="pidStore.connected"
            :pid-id="channel.pidId"
            :pid-name="getPidName(channel.pidId)"
            :revision="channel.revision"
            :samples="channel.samples"
            :history-duration-ms="pidStore.historyDurationMs"
            :time-window-ms="Math.min(30_000, pidStore.historyDurationMs)"
            @select-pid="openPidSelector"
          />
        </v-col>
      </v-row>
    </v-container>
  </v-main>

  <PidInstanceDialog v-model="pidDialogOpen" :channel-id="selectedChannelId" />
  <SettingsDialog v-model="settingsDialogOpen" />
</template>
