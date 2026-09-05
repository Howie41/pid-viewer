import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type PidSample = {
  rtosTick: number
  measured: number
  output: number
}

const maxSamples = 6000
const tickStep = 100

function round(value: number) {
  return Number(value.toFixed(2))
}

export const usePidDemoStore = defineStore('pidDemo', () => {
  const samples = ref<PidSample[]>([])
  const setpoint = ref(60)
  const measured = ref(36)
  const output = ref(0)
  const kp = ref(1.2)
  const ki = ref(0.08)
  const kd = ref(0.02)
  const running = ref(false)
  const nextTick = ref(0)

  const latest = computed(() => samples.value.at(-1))
  const sampleRateHz = computed(() => 1000 / tickStep)

  function appendSample() {
    const error = setpoint.value - measured.value
    output.value = Math.max(0, Math.min(100, output.value + error * kp.value * 0.015 + (Math.random() - 0.5) * 1.2))
    measured.value += (output.value - measured.value) * 0.028 + error * ki.value * 0.04 + (Math.random() - 0.5) * 0.35

    samples.value.push({
      rtosTick: nextTick.value,
      measured: round(measured.value),
      output: round(output.value),
    })
    nextTick.value += tickStep

    if (samples.value.length > maxSamples) {
      samples.value.shift()
    }
  }

  function seed() {
    samples.value = []
    measured.value = 36
    output.value = 0
    nextTick.value = 0

    for (let index = 0; index < 240; index += 1) {
      appendSample()
    }
  }

  function toggleRunning() {
    running.value = !running.value
  }

  seed()

  return { samples, setpoint, measured, output, kp, ki, kd, running, latest, sampleRateHz, appendSample, seed, toggleRunning }
})
