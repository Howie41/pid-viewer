<script setup lang="ts">
import DraggableDialogTitle from '@/components/DraggableDialogTitle.vue'
import { computed, ref, watch } from 'vue'
import { usePidStore } from '@/stores/pid'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{
  modelValue: boolean
  channelId?: number
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const pidStore = usePidStore()
const loading = ref(false)
const saving = ref(false)
const toast = useToastStore()

const selectedChannel = computed(() =>
  pidStore.channels.find((channel) => channel.id === props.channelId),
)

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function assignedChannelId(pidId: number) {
  return pidStore.channels.find(
    (channel) => channel.id !== props.channelId && channel.pidId === pidId,
  )?.id
}

function isAssignedElsewhere(pidId: number) {
  return assignedChannelId(pidId) !== undefined
}

function updateDialog(value: boolean) {
  if (!value && saving.value) return
  emit('update:modelValue', value)
}

async function refreshPidInstances(notify = false) {
  if (!pidStore.connected || loading.value || pidStore.requestPending) return

  loading.value = true
  try {
    await pidStore.discoverPidInstances()
    if (notify) toast.show('已刷新 PID 实例', 'success')
  } catch (error) {
    toast.show(getErrorMessage(error), 'error')
  } finally {
    loading.value = false
  }
}

async function selectPidInstance(pidId: number) {
  const channel = selectedChannel.value
  if (
    !channel ||
    !pidStore.connected ||
    loading.value ||
    saving.value ||
    pidStore.requestPending ||
    isAssignedElsewhere(pidId)
  )
    return
  if (channel.pidId === pidId) {
    updateDialog(false)
    return
  }

  saving.value = true
  const name = pidStore.getInstance(pidId)?.name || '空名称'
  try {
    const pidIds = pidStore.channels.map((item) => (item.id === channel.id ? pidId : item.pidId))
    await pidStore.selectChannels(pidIds)
    toast.show(`监视通道已绑定 PID「${name}」`, 'success')
    emit('update:modelValue', false)
  } catch (error) {
    toast.show(`绑定 PID「${name}」失败：${getErrorMessage(error)}`, 'error')
  } finally {
    saving.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void refreshPidInstances()
  },
)
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :persistent="saving"
    max-width="560"
    scrollable
    @update:model-value="updateDialog"
  >
    <v-card>
      <DraggableDialogTitle class="d-flex align-center">
        <span>选择通道 {{ channelId }} 的 PID 实例</span>
        <v-spacer />
        <v-btn
          icon="mdi-refresh"
          aria-label="重新遍历 PID 实例"
          title="重新遍历 PID 实例"
          :disabled="saving || !pidStore.connected || pidStore.requestPending"
          :loading="loading"
          size="small"
          variant="text"
          @click="refreshPidInstances(true)"
        />
        <v-btn
          icon="mdi-close"
          aria-label="关闭"
          :disabled="saving"
          size="small"
          variant="text"
          @click="updateDialog(false)"
        />
      </DraggableDialogTitle>

      <v-progress-linear v-if="loading" color="primary" indeterminate />

      <v-card-text>

        <v-list v-if="pidStore.instances.length" lines="two">
          <v-list-item
            v-for="pid in pidStore.instances"
            :key="pid.id"
            :active="selectedChannel?.pidId === pid.id"
            :disabled="
              loading ||
              saving ||
              !pidStore.connected ||
              pidStore.requestPending ||
              isAssignedElsewhere(pid.id)
            "
            color="primary"
            rounded="lg"
            @click="selectPidInstance(pid.id)"
          >
            <template #prepend>
              <v-avatar color="primary" size="36" variant="tonal">
                {{ pid.id }}
              </v-avatar>
            </template>

            <v-list-item-title>{{ pid.name || `PID ${pid.id}` }}</v-list-item-title>
            <v-list-item-subtitle>
              PID ID：{{ pid.id }} · Kp {{ pid.kp }} · Ki {{ pid.ki }} · Kd {{ pid.kd }}
              <template v-if="isAssignedElsewhere(pid.id)">
                · 已由通道 {{ assignedChannelId(pid.id) }} 使用
              </template>
            </v-list-item-subtitle>

            <template #append>
              <v-icon
                v-if="selectedChannel?.pidId === pid.id"
                icon="mdi-check-circle"
                color="primary"
              />
            </template>
          </v-list-item>
        </v-list>

        <v-empty-state
          v-else-if="!loading"
          icon="mdi-tune-variant"
          title="未发现 PID 实例"
          text="请确认下位机已注册 PID 实例，然后重新遍历。"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
