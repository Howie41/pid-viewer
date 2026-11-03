<script setup lang="ts">
import DraggableDialogTitle from '@/components/DraggableDialogTitle.vue'
import { ref, watch } from 'vue'
import { useTheme } from 'vuetify'
import { themePreferenceStorageKey } from '@/plugins/vuetify'
import {
  isValidLogLimit,
  maximumLogLimit,
  minimumLogLimit,
  useDebugLogStore,
} from '@/stores/debugLog'
import { maximumHistoryDurationMs, minimumHistoryDurationMs, usePidStore } from '@/stores/pid'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{
  modelValue: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const pidStore = usePidStore()
const log = useDebugLogStore()
const toast = useToastStore()
const theme = useTheme()
const themeOptions = [
  { title: '浅色', value: 'light' },
  { title: '深色', value: 'dark' },
  { title: '跟随系统', value: 'system' },
] as const
type ThemePreference = (typeof themeOptions)[number]['value']
const themePreference = ref<ThemePreference>('system')
const historyDurationSeconds = ref(pidStore.historyDurationMs / 1000)
const testModeEnabled = ref(pidStore.testMode)
const logLimit = ref(log.limit)
const logLimitError = ref('')
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

  const limit = Number(logLimit.value)
  if (!isValidLogLimit(limit)) {
    logLimitError.value = `请输入 ${minimumLogLimit} 至 ${maximumLogLimit} 之间的整数`
    return
  }

  if (!pidStore.setTestMode(testModeEnabled.value)) {
    toast.show('连接或读取串口期间不能启用测试模式', 'warning')
    return
  }
  pidStore.setHistoryDurationMs(duration * 1000)
  log.setLimit(limit)
  theme.change(themePreference.value)
  localStorage.setItem(themePreferenceStorageKey, themePreference.value)
  closeDialog()
  toast.show('设置已保存', 'success')
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    const activeTheme = theme.global.current.value.dark ? 'dark' : 'light'
    themePreference.value = theme.isSystem.value ? 'system' : activeTheme
    historyDurationSeconds.value = pidStore.historyDurationMs / 1000
    testModeEnabled.value = pidStore.testMode
    logLimit.value = log.limit
    logLimitError.value = ''
    errorMessage.value = ''
  },
)
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="520"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <DraggableDialogTitle class="d-flex align-center">
        <span>设置</span>
        <v-spacer />
        <v-btn
          icon="mdi-close"
          aria-label="关闭设置"
          size="small"
          variant="text"
          @click="closeDialog"
        />
      </DraggableDialogTitle>

      <v-card-text>
        <v-alert v-if="errorMessage" class="mb-4" type="error" variant="tonal">
          {{ errorMessage }}
        </v-alert>

        <h2 class="text-subtitle-1 font-weight-medium mb-2">通用</h2>
        <v-select
          v-model="themePreference"
          :items="themeOptions"
          label="外观主题"
          class="mb-4"
          hide-details
        />

        <v-divider class="my-4" />
        <h2 class="text-subtitle-1 font-weight-medium mb-2">PID 监视</h2>
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

        <v-divider class="my-4" />
        <h2 class="text-subtitle-1 font-weight-medium mb-2">调试日志</h2>
        <v-text-field
          v-model.number="logLimit"
          label="最大记录数"
          type="number"
          suffix="条"
          :min="minimumLogLimit"
          :max="maximumLogLimit"
          :step="1"
          :error-messages="logLimitError"
          :hint="`允许设置 ${minimumLogLimit} 至 ${maximumLogLimit} 条。达到上限后，新日志会替换最旧的记录。`"
          persistent-hint
          @update:model-value="logLimitError = ''"
        />
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="closeDialog">取消</v-btn>
        <v-btn color="primary" variant="flat" @click="saveSettings">保存</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
