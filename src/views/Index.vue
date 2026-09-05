<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTheme } from 'vuetify'
import * as echarts from 'echarts/core'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { LineChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'
import DarkModeButton from '@/components/DarkModeButton.vue'
import { usePidDemoStore } from '@/stores/pidDemo'

echarts.use([GridComponent, LegendComponent, TooltipComponent, LineChart, CanvasRenderer])

type MonitorChannel = {
  id: number
  pidId: number
}

const unusedPidId = 0xff
const channels: MonitorChannel[] = [
  { id: 0, pidId: 0 },
  { id: 1, pidId: unusedPidId },
  { id: 2, pidId: unusedPidId },
  { id: 3, pidId: unusedPidId },
]

const pidDemo = usePidDemoStore()
const theme = useTheme()
const chartElements = ref<Array<HTMLDivElement | null>>([])
const charts: Array<echarts.ECharts | undefined> = []
const isDark = computed(() => theme.global.current.value.dark)
let timer: number | undefined

function setChartElement(index: number, element: unknown) {
  chartElements.value[index] = element as HTMLDivElement | null
}

function isChannelActive(channel: MonitorChannel) {
  return channel.pidId !== unusedPidId
}

function channelSubtitle(channel: MonitorChannel) {
  return isChannelActive(channel) ? `PID ID：${channel.pidId}` : '未使用（PID ID：0xFF）'
}

function getChartOption(channel: MonitorChannel): EChartsCoreOption {
  const active = isChannelActive(channel)
  const textColor = isDark.value ? '#bdbdbd' : '#616161'
  const axisColor = isDark.value ? '#616161' : '#bdbdbd'
  const splitLineColor = isDark.value ? '#424242' : '#eeeeee'
  const firstTick = pidDemo.samples[0]?.rtosTick ?? 0
  const lastTick = pidDemo.latest?.rtosTick ?? 1000

  return {
    animation: false,
    tooltip: active
      ? {
          trigger: 'axis',
          valueFormatter: (value: unknown) => (typeof value === 'number' ? value.toFixed(2) : String(value)),
        }
      : undefined,
    legend: {
      show: active,
      top: 0,
      right: 8,
      data: ['ref', 'out'],
      textStyle: { color: textColor },
    },
    grid: { left: 52, right: 20, top: 40, bottom: 48 },
    xAxis: {
      type: 'value',
      name: 'Timestamp (ms)',
      nameLocation: 'middle',
      nameGap: 30,
      min: active ? firstTick : 0,
      max: active ? lastTick : 1000,
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
    graphic: active
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
    series: active
      ? [
          {
            name: 'ref',
            type: 'line',
            showSymbol: false,
            lineStyle: { type: 'dashed', width: 1.5 },
            data: pidDemo.samples.map((sample) => [sample.rtosTick, pidDemo.setpoint]),
          },
          {
            name: 'out',
            type: 'line',
            showSymbol: false,
            smooth: true,
            data: pidDemo.samples.map((sample) => [sample.rtosTick, sample.output]),
          },
        ]
      : [],
  }
}

function renderCharts() {
  channels.forEach((channel) => {
    charts[channel.id]?.setOption(getChartOption(channel), true)
  })
}

function startDemo() {
  if (timer) return
  timer = window.setInterval(pidDemo.appendSample, 100)
  if (!pidDemo.running) pidDemo.toggleRunning()
}

function stopDemo() {
  if (timer) {
    window.clearInterval(timer)
    timer = undefined
  }
  if (pidDemo.running) pidDemo.toggleRunning()
}

function toggleDemo() {
  if (pidDemo.running) stopDemo()
  else startDemo()
}

function resetDemo() {
  pidDemo.seed()
  renderCharts()
}

function resizeCharts() {
  charts.forEach((chart) => chart?.resize())
}

watch(() => pidDemo.samples, renderCharts, { deep: true })
watch(isDark, renderCharts)

onMounted(async () => {
  await nextTick()
  channels.forEach((channel) => {
    const element = chartElements.value[channel.id]
    if (element) charts[channel.id] = echarts.init(element)
  })
  renderCharts()
  startDemo()
  window.addEventListener('resize', resizeCharts)
})

onBeforeUnmount(() => {
  stopDemo()
  window.removeEventListener('resize', resizeCharts)
  charts.forEach((chart) => chart?.dispose())
})
</script>

<template>
  <v-app-bar color="primary">
    <v-app-bar-title>PID Viewer</v-app-bar-title>

    <v-spacer />

    <v-btn
      :prepend-icon="pidDemo.running ? 'mdi-pause' : 'mdi-play'"
      variant="text"
      @click="toggleDemo"
    >
      {{ pidDemo.running ? '暂停' : '运行' }}
    </v-btn>
    <v-btn prepend-icon="mdi-refresh" variant="text" @click="resetDemo">重置</v-btn>
    <DarkModeButton />
  </v-app-bar>

  <v-main>
    <v-container fluid class="chart-page">
      <v-row dense class="chart-grid">
        <v-col v-for="channel in channels" :key="channel.id" cols="12" md="6" class="channel-column">
          <v-card height="100%">
            <v-card-title>通道 {{ channel.id }}</v-card-title>
            <v-card-subtitle>{{ channelSubtitle(channel) }}</v-card-subtitle>
            <v-card-text class="chart-content">
              <div
                :ref="(element) => setChartElement(channel.id, element)"
                class="channel-chart"
                :aria-label="`通道 ${channel.id} 图表`"
              />
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </v-main>
</template>

<style scoped>
.chart-page {
  height: calc(100vh - 64px);
  padding: 12px;
}

.chart-grid {
  height: 100%;
}

.channel-column {
  height: 50%;
  padding: 6px;
}

.channel-column :deep(.v-card) {
  display: flex;
  flex-direction: column;
}

.chart-content {
  flex: 1;
  min-height: 0;
  padding: 0 12px 12px;
}

.channel-chart {
  height: 100%;
  min-height: 200px;
  width: 100%;
}

@media (max-width: 959px) {
  .chart-page {
    height: auto;
  }

  .channel-column {
    height: 360px;
  }
}

@media (max-width: 600px) {
  .chart-page {
    padding: 6px;
  }

  .channel-column {
    height: 320px;
  }

  .channel-column :deep(.v-card-title) {
    font-size: 1rem;
  }
}
</style>
