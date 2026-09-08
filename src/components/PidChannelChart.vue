<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTheme } from 'vuetify'
import * as echarts from 'echarts/core'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import { LineChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'
import type { MonitorSample } from '@/stores/pid'

echarts.use([
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  LineChart,
  CanvasRenderer,
])

const props = withDefaults(
  defineProps<{
    channelId: number
    canSelectPid?: boolean
    pidId: number
    pidName?: string
    revision: number
    samples: MonitorSample[]
    timeWindowMs?: number
  }>(),
  { canSelectPid: false, pidName: '', timeWindowMs: 30_000 },
)
const emit = defineEmits<{
  selectPid: [channelId: number]
}>()

const unusedPidId = 0xff
const theme = useTheme()
const chartElement = ref<HTMLDivElement>()
const paused = ref(false)
const followingLatest = ref(true)
const active = computed(() => props.pidId !== unusedPidId)
const isDark = computed(() => theme.global.current.value.dark)
let chart: echarts.ECharts | undefined
let resizeObserver: ResizeObserver | undefined
let displayedSamples: MonitorSample[] = []

function findWindowStart(samples: MonitorSample[], minimumTimestamp: number) {
  let low = 0
  let high = samples.length
  while (low < high) {
    const middle = (low + high) >>> 1
    const sample = samples[middle]
    if (sample && sample.timestamp < minimumTimestamp) low = middle + 1
    else high = middle
  }
  return low
}

function syncData() {
  const lastTick = props.samples.at(-1)?.timestamp
  if (lastTick === undefined) {
    displayedSamples = []
    return
  }

  const startIndex = findWindowStart(props.samples, lastTick - props.timeWindowMs)
  displayedSamples = props.samples.slice(startIndex)
}

function getChartOption(): EChartsCoreOption {
  const textColor = isDark.value ? '#bdbdbd' : '#616161'
  const axisColor = isDark.value ? '#616161' : '#bdbdbd'
  const splitLineColor = isDark.value ? '#424242' : '#eeeeee'
  const lastTick = displayedSamples.at(-1)?.timestamp ?? 1000
  const windowStart = lastTick - props.timeWindowMs

  return {
    animation: false,
    tooltip: active.value
      ? {
          trigger: 'axis',
          valueFormatter: (value: unknown) =>
            typeof value === 'number' ? value.toFixed(2) : String(value),
        }
      : undefined,
    legend: {
      show: active.value,
      top: 0,
      right: 8,
      data: ['ref', 'measure'],
      textStyle: { color: textColor },
    },
    grid: { left: 52, right: 20, top: 40, bottom: 48 },
    dataZoom: active.value
      ? [
          {
            id: 'time-axis-zoom',
            type: 'inside',
            xAxisIndex: 0,
            filterMode: 'none',
            throttle: 100,
            zoomOnMouseWheel: true,
            moveOnMouseMove: true,
            moveOnMouseWheel: false,
            ...(followingLatest.value ? { start: 0, end: 100 } : {}),
          },
        ]
      : [],
    xAxis: {
      type: 'value',
      name: 'Timestamp (ms)',
      nameLocation: 'middle',
      nameGap: 30,
      min: active.value ? windowStart : 0,
      max: active.value ? lastTick : 1000,
      axisLabel: { color: textColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { lineStyle: { color: splitLineColor } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: textColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { lineStyle: { color: splitLineColor } },
    },
    graphic: active.value
      ? []
      : [
          {
            type: 'text',
            left: 'center',
            top: 'middle',
            style: {
              text: '未绑定 PID 实例',
              fill: textColor,
              fontSize: 14,
            },
          },
        ],
    series: active.value
      ? [
          {
            name: 'ref',
            type: 'line',
            showSymbol: false,
            lineStyle: { type: 'dashed', width: 1.5 },
            sampling: 'lttb',
            animation: false,
            data: displayedSamples.map((sample) => [sample.timestamp, sample.ref]),
          },
          {
            name: 'measure',
            type: 'line',
            showSymbol: false,
            smooth: false,
            sampling: 'lttb',
            animation: false,
            data: displayedSamples.map((sample) => [sample.timestamp, sample.measure]),
          },
        ]
      : [],
  }
}

function renderChart() {
  chart?.setOption(getChartOption(), {
    lazyUpdate: true,
    replaceMerge: ['series'],
  })
}

function togglePlayback() {
  paused.value = !paused.value
  if (!paused.value) {
    followingLatest.value = true
    syncData()
    renderChart()
  }
}

function handleDataZoom() {
  followingLatest.value = false
}

function returnToLatest() {
  paused.value = false
  followingLatest.value = true
  syncData()
  renderChart()
}

watch(
  () => [props.revision, props.pidId, props.timeWindowMs],
  () => {
    if (paused.value || !followingLatest.value) return
    syncData()
    renderChart()
  },
  { immediate: true },
)
watch(isDark, renderChart)

onMounted(async () => {
  await nextTick()
  if (!chartElement.value) return

  chart = echarts.init(chartElement.value)
  chart.on('datazoom', handleDataZoom)
  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(chartElement.value)
  renderChart()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.off('datazoom', handleDataZoom)
  chart?.dispose()
})
</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      <span>通道 {{ channelId }}</span>
      <v-spacer />
      <v-btn
        icon="mdi-list-box-outline"
        aria-label="选择 PID 实例"
        title="选择 PID 实例"
        :disabled="!canSelectPid"
        size="small"
        variant="text"
        @click="emit('selectPid', channelId)"
      />
      <v-btn
        v-if="!followingLatest"
        icon="mdi-arrow-right-bold-circle-outline"
        aria-label="回到最新数据"
        title="回到最新数据"
        :disabled="!active"
        size="small"
        variant="text"
        @click="returnToLatest"
      />
      <v-btn
        :icon="paused ? 'mdi-play' : 'mdi-pause'"
        :aria-label="paused ? '继续图表' : '暂停图表'"
        :disabled="!active"
        size="small"
        variant="text"
        @click="togglePlayback"
      />
    </v-card-title>
    <v-card-subtitle>
      {{
        active
          ? `PID ID：${pidId}${pidName ? ` · ${pidName}` : ''}${
              paused ? ' · 已暂停' : followingLatest ? '' : ' · 已暂停'
            }`
          : '未使用（PID ID：0xFF）'
      }}
    </v-card-subtitle>
    <v-card-text class="pa-2">
      <v-responsive :aspect-ratio="16 / 7">
        <div
          ref="chartElement"
          class="h-100 w-100"
          :aria-label="`通道 ${channelId} 图表，可使用滚轮缩放时间轴并拖动平移`"
        />
      </v-responsive>
    </v-card-text>
  </v-card>
</template>
