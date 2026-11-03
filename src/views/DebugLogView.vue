<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import LogColumnResizeHandle from '@/components/debug-log/LogColumnResizeHandle.vue'
import LogExportDialog from '@/components/debug-log/LogExportDialog.vue'
import LogSearchDialog from '@/components/debug-log/LogSearchDialog.vue'
import type { FormattedLogRow } from '@/services/logCsvExport'
import { useDebugLogStore } from '@/stores/debugLog'
import { useToastStore } from '@/stores/toast'

const log = useDebugLogStore()
const toast = useToastStore()

const props = defineProps<{
  active: boolean
}>()

function makeExampleRow(index: number) {
  const message = index === 0 ? 'initialization complete' : `sample message ${index + 1}`
  return {
    receivedAt: Date.now(),
    text: `#${index + 1}\t${1000 + index * 100}\tuart\t${message}`,
  }
}

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})
const formattedRows = new WeakMap<(typeof log.rows)[number], FormattedLogRow>()
const rows = computed(() =>
  log.rows.map((row) => {
    const cached = formattedRows.get(row)
    if (cached) return cached
    const fields = [timeFormatter.format(row.receivedAt), ...row.text.split('\t')]
    const formatted = { receivedAt: row.receivedAt, fields }
    formattedRows.set(row, formatted)
    return formatted
  }),
)

let exampleTimer: number | undefined
let exampleIndex = 0
onMounted(() => {
  if (!log.rows.length)
    log.append(Array.from({ length: 100 }, () => makeExampleRow(exampleIndex++)))
  exampleTimer = window.setInterval(() => {
    log.append([makeExampleRow(exampleIndex++)])
  }, 100)
})
onBeforeUnmount(() => window.clearInterval(exampleTimer))

function clearLogs() {
  const count = log.rows.length
  if (!count) return
  latestScrollTop = 0
  log.clear()
  toast.show(`已清除 ${count} 条调试日志`)
}
const columnCount = computed(() =>
  rows.value.reduce((max, row) => Math.max(max, row.fields.length), 1),
)
const search = ref({ query: '', column: -1 })
const visibleRows = computed(() => {
  const { query, column } = search.value
  if (!query) return rows.value
  const keyword = query.toLowerCase()
  return rows.value.filter(({ fields }) =>
    column === -1
      ? fields.some((field) => field.toLowerCase().includes(keyword))
      : fields[column]?.toLowerCase().includes(keyword),
  )
})
const columnWidths = ref<Record<number, number>>({})
const scrollbarWidth = ref(0)
const widths = computed(() =>
  Array.from(
    { length: columnCount.value },
    (_, index) =>
      columnWidths.value[index] ?? (index > 0 && index === columnCount.value - 1 ? 480 : 112),
  ),
)
const columnLayout = computed(() => widths.value.map((width) => `${width}px`).join(' '))
const minimumWidth = computed(() =>
  widths.value.reduce((sum, width) => sum + width, scrollbarWidth.value),
)
const rowHeight = 36
const following = ref(true)
const followLabel = computed(() => (following.value ? '解锁日志滚动' : '锁定到最新日志'))
const scroller = useTemplateRef('scroller')
let latestScrollTop = 0

function scrollToLatest() {
  const element = scroller.value?.$el as HTMLElement | undefined
  if (!element || !props.active || !following.value) return
  element.scrollTop = element.scrollHeight
  latestScrollTop = element.scrollTop
}

function onScroll(event: Event) {
  const element = event.currentTarget as HTMLElement
  if (Math.abs(element.scrollTop - latestScrollTop) > 1) following.value = false
}

function toggleFollowing() {
  following.value = !following.value
  if (following.value) scrollToLatest()
}

watch(
  scroller,
  (component, _, onCleanup) => {
    const viewport = component?.$el as HTMLElement | undefined
    const content = viewport?.firstElementChild
    if (!viewport || !content) return

    // Follow once the virtual list's spacers reflect the new content height.
    const observer = new ResizeObserver(() => {
      scrollbarWidth.value = viewport.offsetWidth - viewport.clientWidth
      scrollToLatest()
    })
    observer.observe(viewport)
    observer.observe(content)
    onCleanup(() => observer.disconnect())
  },
  { flush: 'post' },
)
</script>

<template>
  <v-container fluid class="log-panel d-flex flex-column pa-3">
    <div class="log-toolbar d-flex align-center ga-3 py-2">
      <LogSearchDialog v-model:search="search" :column-count="columnCount" />
      <v-btn
        :icon="following ? 'mdi-lock' : 'mdi-lock-open-outline'"
        :aria-label="followLabel"
        :title="followLabel"
        size="small"
        variant="text"
        @click="toggleFollowing"
      />
      <LogExportDialog
        :rows="visibleRows"
        :cached-rows="log.rows"
        :filtered="Boolean(search.query)"
      />
      <span v-if="search.query" class="text-caption text-medium-emphasis">
        {{ visibleRows.length }} 条匹配
      </span>
      <v-spacer />
      <v-btn
        icon="mdi-delete-sweep-outline"
        aria-label="清除日志"
        title="清除日志"
        size="small"
        variant="text"
        :disabled="!log.rows.length"
        @click="clearLogs"
      />
    </div>
    <v-divider />
    <div
      role="table"
      aria-label="调试日志"
      :aria-rowcount="visibleRows.length + 1"
      class="log-table d-flex flex-column flex-grow-1"
      :style="{
        '--log-columns': columnLayout,
        '--log-row-height': `${rowHeight}px`,
        '--log-min-width': `${minimumWidth}px`,
      }"
    >
      <div class="log-row log-header" role="row">
        <LogColumnResizeHandle
          v-for="(width, index) in widths"
          :key="index"
          :width="width"
          :label="index === 0 ? '接收时间列' : `日志字段 ${index} 列`"
          @update:width="columnWidths[index] = $event"
        />
      </div>
      <v-virtual-scroll
        ref="scroller"
        :items="visibleRows"
        :item-height="rowHeight"
        class="log-scroll flex-grow-1"
        role="rowgroup"
        tabindex="0"
        @scroll.passive="onScroll"
      >
        <template #default="{ item, index }">
          <div class="log-row log-entry" role="row" :aria-rowindex="index + 2">
            <span
              v-for="column in columnCount"
              :key="column"
              role="cell"
              :title="item.fields[column - 1]"
            >
              {{ item.fields[column - 1] }}
            </span>
          </div>
        </template>
      </v-virtual-scroll>
      <div v-if="visibleRows.length === 0" class="text-center text-medium-emphasis py-3">
        {{ search.query ? '没有匹配的日志' : '暂无调试日志' }}
      </div>
    </div>
  </v-container>
</template>

<style scoped>
.log-panel {
  height: calc(100dvh - var(--v-layout-top, 0px));
}

.log-table {
  min-height: 0;
  overflow-x: auto;
  background: rgb(var(--v-theme-surface));
}

.log-toolbar {
  min-height: 52px;
}

.log-scroll {
  min-height: 0;
  overflow-anchor: none;
}

.log-header,
.log-scroll {
  scrollbar-gutter: stable;
  min-width: max(100%, var(--log-min-width));
}

.log-row.log-header {
  height: 20px;
  overflow: hidden;
  flex-shrink: 0;
}

.log-row {
  display: grid;
  grid-template-columns: var(--log-columns);
  align-items: center;
  height: var(--log-row-height);
  border-bottom: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.log-entry {
  font-family: Consolas, 'Courier New', monospace;
}

.log-row > span {
  overflow: hidden;
  padding-inline: 16px;
  white-space: pre;
  text-overflow: ellipsis;
}
</style>
