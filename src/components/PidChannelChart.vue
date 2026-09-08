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
    historyDurationMs?: number
    timeWindowMs?: number
  }>(),
  { canSelectPid: false, historyDurationMs: 10 * 60_000, pidName: '', timeWindowMs: 30_000 },
)
const emit = defineEmits<{
  selectPid: [channelId: number]
}>()

const unusedPidId = 0xff
const minimumTimeWindowMs = 100
const pointsPerPixel = 2
const theme = useTheme()
const chartElement = ref<HTMLDivElement>()
const paused = ref(false)
const followingLatest = ref(true)
const expanded = ref(false)
const visibleDurationMs = ref(props.timeWindowMs)
const active = computed(() => props.pidId !== unusedPidId)
const isDark = computed(() => theme.global.current.value.dark)
let chart: echarts.ECharts | undefined
let resizeObserver: ResizeObserver | undefined
let resizeFrame: number | undefined
let displayedSamples: MonitorSample[] = []
let historyStartTimestamp = 0
let latestTimestamp = 0
let viewStartTimestamp = 0
let viewEndTimestamp = 0

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

function findWindowEnd(samples: MonitorSample[], maximumTimestamp: number) {
  let low = 0
  let high = samples.length
  while (low < high) {
    const middle = (low + high) >>> 1
    const sample = samples[middle]
    if (sample && sample.timestamp <= maximumTimestamp) low = middle + 1
    else high = middle
  }
  return low
}

function syncData() {
  const firstTick = props.samples[0]?.timestamp
  const lastTick = props.samples.at(-1)?.timestamp
  if (firstTick === undefined || lastTick === undefined) {
    displayedSamples = []
    historyStartTimestamp = 0
    latestTimestamp = 0
    viewStartTimestamp = 0
    viewEndTimestamp = 1000
    return
  }

  historyStartTimestamp = Math.max(firstTick, lastTick - props.historyDurationMs)
  latestTimestamp = lastTick
  if (followingLatest.value || viewEndTimestamp === 0) viewEndTimestamp = latestTimestamp
  else
    viewEndTimestamp = Math.min(Math.max(viewEndTimestamp, historyStartTimestamp), latestTimestamp)

  visibleDurationMs.value = Math.max(minimumTimeWindowMs, visibleDurationMs.value)
  viewStartTimestamp = viewEndTimestamp - visibleDurationMs.value

  const startIndex = Math.max(
    0,
    findWindowStart(props.samples, Math.max(historyStartTimestamp, viewStartTimestamp)) - 1,
  )
  const endIndex = Math.min(
    props.samples.length,
    findWindowEnd(props.samples, viewEndTimestamp) + 1,
  )
  displayedSamples = props.samples.slice(startIndex, endIndex)
}

function buildSeriesData(valueKey: 'ref' | 'measure') {
  const maxPoints = Math.max(200, Math.floor((chart?.getWidth() ?? 800) * pointsPerPixel))
  if (displayedSamples.length <= maxPoints) {
    return displayedSamples.map((sample) => [sample.timestamp, sample[valueKey]])
  }

  const data: number[][] = []
  const bucketCount = Math.max(1, Math.floor((maxPoints - 2) / 2))
  const bucketSize = (displayedSamples.length - 2) / bucketCount
  data.push([displayedSamples[0]!.timestamp, displayedSamples[0]![valueKey]])

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = 1 + Math.floor(bucket * bucketSize)
    const end = Math.min(displayedSamples.length - 1, 1 + Math.floor((bucket + 1) * bucketSize))
    let minimumIndex = start
    let maximumIndex = start

    for (let index = start + 1; index < end; index += 1) {
      const sample = displayedSamples[index]!
      if (sample[valueKey] < displayedSamples[minimumIndex]![valueKey]) minimumIndex = index
      if (sample[valueKey] > displayedSamples[maximumIndex]![valueKey]) maximumIndex = index
    }

    for (const index of [minimumIndex, maximumIndex].sort((left, right) => left - right)) {
      const sample = displayedSamples[index]!
      if (sample.timestamp === data.at(-1)?.[0]) continue
      data.push([sample.timestamp, sample[valueKey]])
    }
  }

  const lastSample = displayedSamples.at(-1)!
  if (data.at(-1)?.[0] !== lastSample.timestamp) {
    data.push([lastSample.timestamp, lastSample[valueKey]])
  }
  return data
}

function findNearestSample(timestamp: number) {
  if (displayedSamples.length === 0) return undefined
  const index = findWindowStart(displayedSamples, timestamp)
  const before = displayedSamples[Math.max(0, index - 1)]
  const after = displayedSamples[Math.min(displayedSamples.length - 1, index)]
  if (!before) return after
  if (!after) return before
  return timestamp - before.timestamp <= after.timestamp - timestamp ? before : after
}

function formatTooltip(params: unknown) {
  const entries = Array.isArray(params) ? params : [params]
  const firstEntry = entries[0] as { axisValue?: number | string } | undefined
  const timestamp = Number(firstEntry?.axisValue)
  const sample = Number.isFinite(timestamp) ? findNearestSample(timestamp) : undefined
  if (!sample) return ''

  return [
    `<strong>${sample.timestamp.toLocaleString()} ms</strong>`,
    `<span style="color:#5470c6">●</span> ref&nbsp;&nbsp;&nbsp;${sample.ref.toFixed(2)}`,
    `<span style="color:#91cc75">●</span> measure&nbsp;&nbsp;&nbsp;${sample.measure.toFixed(2)}`,
  ].join('<br>')
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} s`
  return `${(durationMs / 60_000).toFixed(durationMs < 600_000 ? 1 : 0)} min`
}

function getChartOption(): EChartsCoreOption {
  const textColor = isDark.value ? '#bdbdbd' : '#616161'
  const axisColor = isDark.value ? '#616161' : '#bdbdbd'
  const splitLineColor = isDark.value ? '#424242' : '#eeeeee'
  const axisMinimum = Math.min(historyStartTimestamp, viewStartTimestamp)
  const axisMaximum = Math.max(latestTimestamp, viewEndTimestamp, axisMinimum + 1)

  return {
    animation: false,
    tooltip: active.value
      ? {
          trigger: 'axis',
          axisPointer: { type: 'cross', snap: true },
          formatter: formatTooltip,
          confine: true,
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
            startValue: viewStartTimestamp,
            endValue: viewEndTimestamp,
            minValueSpan: minimumTimeWindowMs,
          },
        ]
      : [],
    xAxis: {
      type: 'value',
      name: 'Timestamp (ms)',
      nameLocation: 'middle',
      nameGap: 30,
      min: active.value ? axisMinimum : 0,
      max: active.value ? axisMaximum : 1000,
      minInterval: 1,
      axisLabel: {
        color: textColor,
        formatter: (value: number) => Math.round(value).toLocaleString(),
      },
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
            animation: false,
            data: buildSeriesData('ref'),
          },
          {
            name: 'measure',
            type: 'line',
            showSymbol: false,
            smooth: false,
            animation: false,
            data: buildSeriesData('measure'),
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
  if (paused.value || !followingLatest.value) {
    paused.value = false
    followingLatest.value = true
    syncData()
    renderChart()
    return
  }
  paused.value = true
}

function handleDataZoom(event: unknown) {
  const dataZoomEvent = event as {
    start?: number
    end?: number
    startValue?: number
    endValue?: number
    batch?: Array<{
      start?: number
      end?: number
      startValue?: number
      endValue?: number
    }>
  }
  const range = dataZoomEvent.batch?.[0] ?? dataZoomEvent
  const axisMinimum = Math.min(historyStartTimestamp, viewStartTimestamp)
  const axisMaximum = Math.max(latestTimestamp, viewEndTimestamp, axisMinimum + 1)
  const axisDuration = axisMaximum - axisMinimum
  const startValue = Math.round(
    typeof range.startValue === 'number'
      ? range.startValue
      : axisMinimum + ((range.start ?? 0) / 100) * axisDuration,
  )
  const endValue = Math.round(
    typeof range.endValue === 'number'
      ? range.endValue
      : axisMinimum + ((range.end ?? 100) / 100) * axisDuration,
  )

  const nextDuration = Math.round(
    Math.min(axisDuration, Math.max(minimumTimeWindowMs, endValue - startValue)),
  )
  const durationChanged =
    Math.abs(nextDuration - visibleDurationMs.value) > Math.max(2, visibleDurationMs.value * 0.005)

  if (followingLatest.value && durationChanged) {
    visibleDurationMs.value = nextDuration
    viewEndTimestamp = latestTimestamp
  } else {
    const atLatest = latestTimestamp - endValue <= Math.max(20, nextDuration * 0.01)
    visibleDurationMs.value = nextDuration
    followingLatest.value = atLatest
    viewEndTimestamp = atLatest ? latestTimestamp : endValue
  }

  syncData()
  renderChart()
}

function toggleExpanded() {
  expanded.value = !expanded.value
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && expanded.value) expanded.value = false
}

watch(
  () => props.revision,
  () => {
    if (paused.value || !followingLatest.value) return
    syncData()
    renderChart()
  },
  { immediate: true },
)
watch(
  () => props.pidId,
  () => {
    paused.value = false
    followingLatest.value = true
    viewEndTimestamp = 0
    syncData()
    renderChart()
  },
)
watch(
  () => props.timeWindowMs,
  (duration) => {
    visibleDurationMs.value = duration
    syncData()
    renderChart()
  },
)
watch(
  () => props.historyDurationMs,
  () => {
    syncData()
    renderChart()
  },
)
watch(isDark, renderChart)

onMounted(async () => {
  await nextTick()
  if (!chartElement.value) return

  chart = echarts.init(chartElement.value)
  chart.on('datazoom', handleDataZoom)
  resizeObserver = new ResizeObserver(() => {
    if (resizeFrame !== undefined) return
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = undefined
      chart?.resize()
      renderChart()
    })
  })
  resizeObserver.observe(chartElement.value)
  window.addEventListener('keydown', handleKeydown)
  renderChart()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', handleKeydown)
  if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
  chart?.off('datazoom', handleDataZoom)
  chart?.dispose()
})
</script>

<template>
  <div v-if="expanded" class="channel-chart-scrim" @click="expanded = false" />
  <v-card :class="{ 'channel-chart--expanded': expanded }">
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
        :icon="expanded ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
        :aria-label="expanded ? '退出视口放大' : '放大到视口'"
        :title="expanded ? '退出视口放大' : '放大到视口'"
        size="small"
        variant="text"
        @click="toggleExpanded"
      />
      <v-btn
        :icon="paused || !followingLatest ? 'mdi-play' : 'mdi-pause'"
        :aria-label="paused || !followingLatest ? '回到最新数据并继续' : '暂停图表'"
        :title="paused || !followingLatest ? '回到最新数据并继续' : '暂停图表'"
        :disabled="!active"
        size="small"
        variant="text"
        @click="togglePlayback"
      />
    </v-card-title>
    <v-card-subtitle>
      {{
        active
          ? `PID ID：${pidId}${pidName ? ` · ${pidName}` : ''} · 窗口 ${formatDuration(
              visibleDurationMs,
            )}${paused ? ' · 已暂停' : followingLatest ? ' · 实时跟随' : ' · 历史回看'}`
          : '未使用（PID ID：0xFF）'
      }}
    </v-card-subtitle>
    <v-card-text class="chart-body pa-2">
      <v-responsive class="chart-responsive" :aspect-ratio="expanded ? undefined : 16 / 7">
        <div
          ref="chartElement"
          class="h-100 w-100"
          :aria-label="`通道 ${channelId} 图表，可使用滚轮缩放时间轴并拖动平移`"
        />
      </v-responsive>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.channel-chart-scrim {
  position: fixed;
  z-index: 2399;
  inset: 0;
  background: rgb(0 0 0 / 55%);
}

.channel-chart--expanded {
  position: fixed;
  z-index: 2400;
  inset: 12px;
  display: flex;
  flex-direction: column;
  height: auto;
}

.channel-chart--expanded .chart-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.channel-chart--expanded .chart-responsive {
  flex: 1;
  min-height: 0;
}
</style>
