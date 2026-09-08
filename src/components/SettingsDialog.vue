<script setup lang="ts">
import { ref, watch } from 'vue'
import { maximumHistoryDurationMs, minimumHistoryDurationMs, usePidStore } from '@/stores/pid'

const props = defineProps<{
  modelValue: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const pidStore = usePidStore()
const historyDurationSeconds = ref(pidStore.historyDurationMs / 1000)
const testModeEnabled = ref(pidStore.testMode)
const errorMessage = ref('')

const minimumHistorySeconds = minimumHistoryDurationMs / 1000
const maximumHistorySeconds = maximumHistoryDurationMs / 1000

function closeDialog() {
  emit('update:modelValue', false)
}

function saveSettings() {
  const duration = Number(historyDurationSeconds.value)
  if (!Number.isFinite(duration) || duration < minimumHistorySeconds) {
    errorMessage.value = `历史时长不能小于 ${minimumHistorySeconds} 秒`
    return
  }
  if (duration > maximumHistorySeconds) {
    errorMessage.value = `历史时长不能超过 ${maximumHistorySeconds / 60} 分钟`
    return
  }

  pidStore.setHistoryDurationMs(duration * 1000)
  if (!pidStore.setTestMode(testModeEnabled.value)) {
    errorMessage.value = '连接或读取串口期间不能启用测试模式'
    return
  }
  closeDialog()
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    historyDurationSeconds.value = pidStore.historyDurationMs / 1000
    testModeEnabled.value = pidStore.testMode
    errorMessage.value = ''
  },
)
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="520"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="d-flex align-center">
        <span>设置</span>
        <v-spacer />
        <v-btn
          icon="mdi-close"
          aria-label="关闭设置"
          size="small"
          variant="text"
          @click="closeDialog"
        />
      </v-card-title>

      <v-card-text>
        <v-alert v-if="errorMessage" class="mb-4" type="error" variant="tonal">
          {{ errorMessage }}
        </v-alert>

        <v-text-field
          v-model.number="historyDurationSeconds"
          label="图表历史保留时长"
          type="number"
          suffix="秒"
          :min="minimumHistorySeconds"
          :max="maximumHistorySeconds"
          :step="1"
          hint="超出时长的数据会被自动丢弃；允许设置 1 秒至 60 分钟。"
          persistent-hint
        />

        <v-divider class="my-4" />

        <v-switch
          v-model="testModeEnabled"
          color="primary"
          label="测试模式"
          :disabled="pidStore.connected || pidStore.busy"
          hide-details="auto"
        />
        <div class="text-body-2 text-medium-emphasis ml-1 mt-1">
          未连接时，以 100 Hz 向通道 0 输出独立生成的阶跃测试数据，不经过串口传输层。
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="closeDialog">取消</v-btn>
        <v-btn color="primary" variant="flat" @click="saveSettings">保存</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
