<script setup lang="ts">
import DraggableDialogTitle from '@/components/DraggableDialogTitle.vue'
import { computed, ref, watch } from 'vue'
import { usePidStore } from '@/stores/pid'
import { usePidHistoryStore } from '@/stores/pidHistory'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{ modelValue: boolean; pidId?: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const pidStore = usePidStore()
const history = usePidHistoryStore()
const pid = computed(() => pidStore.instances.find((item) => item.id === props.pidId))
const fields = ['kp', 'ki', 'kd'] as const
const draft = ref({ kp: '', ki: '', kd: '' })
const saving = ref(false)
const loading = ref(false)
const parametersLoaded = ref(false)
const toast = useToastStore()
const parameterRules = [
  (value: string) =>
    (typeof value === 'string' &&
      value.trim() !== '' &&
      Number.isFinite(Math.fround(Number(value)))) ||
    '请输入有限的 float32 数值',
]
const valid = computed(() =>
  fields.every((field) => parameterRules[0]!(draft.value[field]) === true),
)

function loadParameters() {
  if (!pid.value) return
  for (const field of fields) draft.value[field] = String(pid.value[field])
}

function closeDialog(value: boolean) {
  if (!saving.value && !loading.value) emit('update:modelValue', value)
}

async function refreshParameters(notify = false) {
  const pidId = props.pidId
  if (pidId === undefined || loading.value || saving.value) return
  const label = `「${pid.value?.name || '空名称'}」`
  loading.value = true
  parametersLoaded.value = false
  draft.value = { kp: '', ki: '', kd: '' }
  try {
    const response = await pidStore.refreshPidParameters(pidId)
    if (!props.modelValue || props.pidId !== pidId) return
    for (const field of fields) draft.value[field] = String(response[field])
    parametersLoaded.value = true
    if (notify) toast.show(`已读取 ${label} 的 PID 参数`, 'success')
  } catch (error) {
    if (props.modelValue && props.pidId === pidId) {
      toast.show(
        `读取 ${label} 参数失败：${error instanceof Error ? error.message : String(error)}`,
        'error',
      )
    }
  } finally {
    loading.value = false
  }
}

async function saveParameters() {
  if (
    !pid.value ||
    !valid.value ||
    !parametersLoaded.value ||
    loading.value ||
    saving.value ||
    pidStore.requestPending
  )
    return
  saving.value = true
  const { id, name } = pid.value
  const label = `「${name || '空名称'}」`
  try {
    const { kp, ki, kd } = draft.value
    await pidStore.setPid(id, Number(kp), Number(ki), Number(kd))
    history.record(name, Number(kp), Number(ki), Number(kd))
    loadParameters()
    toast.show(`${label} 的 PID 参数已生效`, 'success')
    if (history.errorMessage) toast.show(`${label}：${history.errorMessage}`, 'warning')
  } catch (error) {
    toast.show(
      `应用 ${label} 参数失败：${error instanceof Error ? error.message : String(error)}`,
      'error',
    )
  } finally {
    saving.value = false
  }
}

watch(
  () => [props.modelValue, props.pidId] as const,
  ([open]) => {
    if (!open) return
    void refreshParameters()
  },
  { immediate: true },
)
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :persistent="saving || loading"
    max-width="480"
    scrollable
    @update:model-value="closeDialog"
  >
    <v-card>
      <DraggableDialogTitle class="d-flex align-center">
        <span>调节 PID 参数</span>
        <v-spacer />
        <v-btn
          icon="mdi-refresh"
          aria-label="读取 PID 参数"
          title="读取 PID 参数"
          size="small"
          variant="text"
          :loading="loading"
          :disabled="saving || !pidStore.connected || pidStore.requestPending"
          @click="refreshParameters(true)"
        />
        <v-btn
          icon="mdi-close"
          aria-label="关闭"
          title="关闭"
          size="small"
          variant="text"
          :disabled="saving || loading"
          @click="closeDialog(false)"
        />
      </DraggableDialogTitle>
      <v-progress-linear v-if="loading" color="primary" indeterminate />
      <v-card-text>
        <div class="text-body-1 mb-4 text-break">
          {{ pid?.name || `PID ${pidId}` }} · PID ID：{{ pidId }}
        </div>
        <v-alert v-if="!pidStore.connected" class="mb-4" type="warning" variant="tonal">
          串口已断开
        </v-alert>
        <v-form @submit.prevent="saveParameters">
          <v-text-field
            v-for="field in fields"
            :key="field"
            v-model="draft[field]"
            :label="{ kp: 'Kp', ki: 'Ki', kd: 'Kd' }[field]"
            type="number"
            step="any"
            :rules="parameterRules"
            :disabled="loading || saving || !parametersLoaded || !pidStore.connected || !pid"
          />
          <div class="text-body-2 text-medium-emphasis mb-4">
            参数仅在 RAM 中生效，设备重启后恢复原有配置。
          </div>
          <div class="text-body-2 mb-4">
            当前生效：Kp {{ pid?.kp }} · Ki {{ pid?.ki }} · Kd {{ pid?.kd }}
          </div>
          <v-btn
            type="submit"
            color="primary"
            prepend-icon="mdi-check"
            :loading="saving"
            :disabled="
              loading ||
              !parametersLoaded ||
              !valid ||
              !pid ||
              !pidStore.connected ||
              pidStore.requestPending
            "
          >
            应用参数
          </v-btn>
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
