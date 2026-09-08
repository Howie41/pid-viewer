<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { usePidStore } from '@/stores/pid'

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
const errorMessage = ref('')

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

async function refreshPidInstances() {
  if (!pidStore.connected || loading.value) return

  loading.value = true
  errorMessage.value = ''
  try {
    await pidStore.discoverPidInstances()
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

async function selectPidInstance(pidId: number) {
  const channel = selectedChannel.value
  if (!channel || saving.value || isAssignedElsewhere(pidId)) return
  if (channel.pidId === pidId) {
    updateDialog(false)
    return
  }

  saving.value = true
  errorMessage.value = ''
  try {
    const pidIds = pidStore.channels.map((item) => (item.id === channel.id ? pidId : item.pidId))
    await pidStore.selectChannels(pidIds)
    emit('update:modelValue', false)
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
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
      <v-card-title class="d-flex align-center">
        <span>选择通道 {{ channelId }} 的 PID 实例</span>
        <v-spacer />
        <v-btn
          icon="mdi-refresh"
          aria-label="重新遍历 PID 实例"
          title="重新遍历 PID 实例"
          :disabled="saving"
          :loading="loading"
          size="small"
          variant="text"
          @click="refreshPidInstances"
        />
        <v-btn
          icon="mdi-close"
          aria-label="关闭"
          :disabled="saving"
          size="small"
          variant="text"
          @click="updateDialog(false)"
        />
      </v-card-title>

      <v-progress-linear v-if="loading" color="primary" indeterminate />

      <v-card-text>
        <v-alert v-if="errorMessage" class="mb-3" type="error" variant="tonal">
          {{ errorMessage }}
        </v-alert>

        <v-list v-if="pidStore.instances.length" lines="two">
          <v-list-item
            v-for="pid in pidStore.instances"
            :key="pid.id"
            :active="selectedChannel?.pidId === pid.id"
            :disabled="loading || saving || isAssignedElsewhere(pid.id)"
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
          v-else-if="!loading && !errorMessage"
          icon="mdi-tune-variant"
          title="未发现 PID 实例"
          text="请确认下位机已注册 PID 实例，然后重新遍历。"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
