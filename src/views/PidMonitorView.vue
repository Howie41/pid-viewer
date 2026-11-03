<script setup lang="ts">
import { ref } from 'vue'
import PidChannelChart from '@/components/pid/PidChannelChart.vue'
import PidHistoryDialog from '@/components/pid/PidHistoryDialog.vue'
import PidInstanceDialog from '@/components/pid/PidInstanceDialog.vue'
import PidParametersDialog from '@/components/pid/PidParametersDialog.vue'
import { usePidStore } from '@/stores/pid'

const pidStore = usePidStore()
const pidDialogOpen = ref(false)
const selectedChannelId = ref<number>()
const parametersDialogOpen = ref(false)
const selectedPidId = ref<number>()

function getPidName(pidId: number) {
  return pidStore.getInstance(pidId)?.name
}

function openPidSelector(channelId: number) {
  selectedChannelId.value = channelId
  pidDialogOpen.value = true
}

function openPidParameters(pidId: number) {
  selectedPidId.value = pidId
  parametersDialogOpen.value = true
}
</script>

<template>
  <v-container fluid class="pa-3">
    <div class="d-flex align-center ga-3 py-2 mb-2">
      <PidHistoryDialog />
    </div>
    <v-row dense>
      <v-col v-for="channel in pidStore.channels" :key="channel.id" cols="12" md="6">
        <PidChannelChart
          :channel-id="channel.id"
          :can-select-pid="pidStore.connected && !pidStore.requestPending"
          :can-tune-pid="pidStore.connected && !pidStore.requestPending"
          :pid-id="channel.pidId"
          :pid-name="getPidName(channel.pidId)"
          :revision="channel.revision"
          :samples="channel.samples"
          :history-duration-ms="pidStore.historyDurationMs"
          :time-window-ms="Math.min(30_000, pidStore.historyDurationMs)"
          @select-pid="openPidSelector"
          @tune-pid="openPidParameters"
        />
      </v-col>
    </v-row>
  </v-container>

  <PidInstanceDialog v-model="pidDialogOpen" :channel-id="selectedChannelId" />
  <PidParametersDialog v-model="parametersDialogOpen" :pid-id="selectedPidId" />
</template>
