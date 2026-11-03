<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DraggableDialogTitle from '@/components/DraggableDialogTitle.vue'
import { downloadLogCsv } from '@/services/logCsvExport'
import type { FormattedLogRow } from '@/services/logCsvExport'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{
  rows: readonly FormattedLogRow[]
  cachedRows: readonly { receivedAt: number }[]
  filtered: boolean
}>()
const toast = useToastStore()
const open = ref(false)
const scope = ref<'all' | 'range'>('all')
const start = ref('')
const end = ref('')

function formatLocalTime(timestamp: number) {
  const offset = new Date(timestamp).getTimezoneOffset() * 60_000
  return new Date(timestamp - offset).toISOString().slice(0, 19)
}

watch(open, (visible) => {
  if (visible) scope.value = 'all'
})

watch(scope, (value) => {
  if (value !== 'range') return
  let earliest = Infinity
  let latest = -Infinity
  for (const { receivedAt } of props.cachedRows) {
    earliest = Math.min(earliest, receivedAt)
    latest = Math.max(latest, receivedAt)
  }
  start.value = Number.isFinite(earliest) ? formatLocalTime(earliest) : ''
  end.value = Number.isFinite(latest) ? formatLocalTime(latest) : ''
})

const startTime = computed(() => new Date(start.value).getTime())
const endTime = computed(() => new Date(end.value).getTime())
const validRange = computed(
  () =>
    Number.isFinite(startTime.value) &&
    Number.isFinite(endTime.value) &&
    startTime.value <= endTime.value,
)
const selectedRows = computed(() => {
  if (scope.value === 'all') return props.rows
  if (!validRange.value) return []
  return props.rows.filter(
    ({ receivedAt }) => receivedAt >= startTime.value && receivedAt < endTime.value + 1000,
  )
})

function exportLogs() {
  const rows = selectedRows.value
  if (!rows.length) return
  try {
    downloadLogCsv(rows)
    open.value = false
    toast.show(`已导出 ${rows.length} 条调试日志`, 'success')
  } catch {
    toast.show('无法导出调试日志', 'error')
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="480" scrollable>
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        icon="mdi-download-outline"
        aria-label="导出日志"
        title="导出日志"
        size="small"
        variant="text"
      />
    </template>

    <form @submit.prevent="exportLogs">
      <v-card>
        <DraggableDialogTitle>导出日志</DraggableDialogTitle>
        <v-card-text>
          <v-radio-group v-model="scope" label="导出范围" hide-details>
            <v-radio :label="filtered ? '全部匹配日志' : '全部日志'" value="all" />
            <v-radio label="指定时间段" value="range" />
          </v-radio-group>
          <div v-if="scope === 'range'" class="mt-4">
            <v-text-field v-model="start" label="开始时间" type="datetime-local" step="1" />
            <v-text-field
              v-model="end"
              label="结束时间"
              type="datetime-local"
              step="1"
              :min="start || undefined"
              :error-messages="start && end && !validRange ? '结束时间不能早于开始时间' : ''"
            />
            <p class="text-caption text-medium-emphasis">
              按本地接收时间筛选，包含结束时刻所在的一秒。
            </p>
          </div>
          <p class="mt-3 text-body-2">
            {{ filtered ? '当前筛选已生效 · ' : '' }}可导出 {{ selectedRows.length }} 条
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="open = false">取消</v-btn>
          <v-btn type="submit" color="primary" variant="flat" :disabled="!selectedRows.length">
            导出 CSV
          </v-btn>
        </v-card-actions>
      </v-card>
    </form>
  </v-dialog>
</template>
