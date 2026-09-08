import { computed, markRaw, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import {
  AckStatus,
  FrameType,
  PidInfoStatus,
  UNUSED_PID_ID,
  encodeReadPid,
  encodeSelectChannels,
  encodeSetPid,
} from '@/protocol/pidProtocol'
import type { AckFrame, MonitorFrame, PidInfoFrame, ReceivedFrame } from '@/protocol/pidProtocol'
import { PidSerialTransport } from '@/services/pidSerialTransport'
import { PidTestDataSource } from '@/services/pidTestDataSource'
import type { PidTestSample } from '@/services/pidTestDataSource'

export type ConnectionStatus =
  'unsupported' | 'disconnected' | 'connecting' | 'discovering' | 'connected' | 'error'

export type PidInstance = {
  id: number
  name: string
  kp: number
  ki: number
  kd: number
  ref: number
  measure: number
}

export type MonitorSample = {
  timestamp: number
  ref: number
  measure: number
}

export type MonitorChannel = {
  id: number
  pidId: number
  samples: MonitorSample[]
  revision: number
}

type FrameWaiter = {
  predicate: (frame: ReceivedFrame) => boolean
  resolve: (frame: ReceivedFrame) => void
  reject: (error: Error) => void
  timer: number
}

export const minimumHistoryDurationMs = 1000
export const maximumHistoryDurationMs = 60 * 60_000
export const defaultHistoryDurationMs = 10 * 60_000
const historyDurationStorageKey = 'pid-viewer.history-duration-ms'
const historyTrimMarginMs = 5000
const monitorFlushIntervalMs = 50
const responseTimeoutMs = 800
const maxReadRetries = 3

function createEmptyChannels(): MonitorChannel[] {
  return Array.from({ length: 4 }, (_, id) => ({
    id,
    pidId: UNUSED_PID_ID,
    samples: [],
    revision: 0,
  }))
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}

function loadHistoryDuration() {
  if (typeof localStorage === 'undefined') return defaultHistoryDurationMs
  const value = Number(localStorage.getItem(historyDurationStorageKey))
  return Number.isFinite(value)
    ? Math.min(maximumHistoryDurationMs, Math.max(minimumHistoryDurationMs, Math.round(value)))
    : defaultHistoryDurationMs
}

function ackError(status: AckStatus) {
  const messages: Record<AckStatus, string> = {
    [AckStatus.Ok]: '操作成功',
    [AckStatus.PidNotFound]: 'PID 实例不存在',
    [AckStatus.InvalidParameter]: 'PID 参数非法',
    [AckStatus.InvalidChannel]: '通道配置非法',
    [AckStatus.CrcError]: '下位机报告 CRC 错误',
    [AckStatus.UnsupportedCommand]: '下位机不支持该命令',
  }
  return new Error(messages[status] ?? `未知 ACK 状态：${status}`)
}

export const usePidStore = defineStore('pid', () => {
  const supported = typeof navigator !== 'undefined' && PidSerialTransport.isSupported()
  const connectionStatus = ref<ConnectionStatus>(supported ? 'disconnected' : 'unsupported')
  const errorMessage = ref('')
  const instances = ref<PidInstance[]>([])
  const channels = shallowRef<MonitorChannel[]>(createEmptyChannels())
  const lastTimestamp = ref(0)
  const historyDurationMs = ref(loadHistoryDuration())
  const testMode = ref(false)
  const waiters: FrameWaiter[] = []
  const pendingMonitorFrames: MonitorFrame[] = []
  const pendingTestSamples: PidTestSample[] = []
  let transport: PidSerialTransport | undefined
  let testDataSource: PidTestDataSource | undefined
  let monitorFlushTimer: number | undefined
  let testFlushTimer: number | undefined

  const connected = computed(() => connectionStatus.value === 'connected')
  const busy = computed(
    () => connectionStatus.value === 'connecting' || connectionStatus.value === 'discovering',
  )

  function upsertInstance(pid: PidInstance) {
    const index = instances.value.findIndex((item) => item.id === pid.id)
    if (index === -1) instances.value.push(pid)
    else instances.value[index] = pid
    instances.value.sort((left, right) => left.id - right.id)
  }

  function updateInstanceValues(pidId: number, refValue: number, measure: number) {
    const index = instances.value.findIndex((item) => item.id === pidId)
    if (index === -1) return
    instances.value[index] = { ...instances.value[index], ref: refValue, measure }
  }

  function trimSamples(samples: MonitorSample[], latestTimestamp: number, force = false) {
    const cutoff = latestTimestamp - historyDurationMs.value
    const firstTimestamp = samples[0]?.timestamp
    if (
      firstTimestamp === undefined ||
      (!force && firstTimestamp >= cutoff - historyTrimMarginMs)
    ) {
      return false
    }

    let low = 0
    let high = samples.length
    while (low < high) {
      const middle = (low + high) >>> 1
      const sample = samples[middle]
      if (sample && sample.timestamp < cutoff) low = middle + 1
      else high = middle
    }
    if (low === 0) return false
    samples.splice(0, low)
    return true
  }

  function flushMonitorFrames() {
    monitorFlushTimer = undefined
    if (pendingMonitorFrames.length === 0) return

    const frames = pendingMonitorFrames.splice(0)
    const nextChannels = channels.value.slice()
    const latestValues = new Map<number, { ref: number; measure: number }>()

    for (let index = 0; index < nextChannels.length; index += 1) {
      const previous = nextChannels[index]
      if (!previous) continue

      let pidId = previous.pidId
      let samples = previous.samples
      let changed = false

      for (const frame of frames) {
        const incoming = frame.channels[index]
        if (!incoming) continue

        if (incoming.pidId === UNUSED_PID_ID) {
          if (pidId !== UNUSED_PID_ID || samples.length > 0) {
            pidId = UNUSED_PID_ID
            samples = []
            changed = true
          }
          continue
        }

        if (pidId !== incoming.pidId) {
          pidId = incoming.pidId
          samples = []
        }

        samples.push({
          timestamp: frame.timestamp,
          ref: incoming.ref,
          measure: incoming.measure,
        })
        latestValues.set(incoming.pidId, { ref: incoming.ref, measure: incoming.measure })
        changed = true
      }

      if (!changed) continue
      trimSamples(samples, frames.at(-1)?.timestamp ?? lastTimestamp.value)
      nextChannels[index] = {
        id: previous.id,
        pidId,
        samples,
        revision: previous.revision + 1,
      }
    }

    channels.value = nextChannels
    lastTimestamp.value = frames.at(-1)?.timestamp ?? lastTimestamp.value
    for (const [pidId, values] of latestValues) {
      updateInstanceValues(pidId, values.ref, values.measure)
    }
  }

  function scheduleMonitorFlush() {
    if (monitorFlushTimer !== undefined) return
    monitorFlushTimer = window.setTimeout(flushMonitorFrames, monitorFlushIntervalMs)
  }

  function clearPendingMonitorFrames() {
    if (monitorFlushTimer !== undefined) window.clearTimeout(monitorFlushTimer)
    monitorFlushTimer = undefined
    pendingMonitorFrames.length = 0
  }

  function flushTestSamples() {
    testFlushTimer = undefined
    if (!testMode.value || pendingTestSamples.length === 0) return

    const incoming = pendingTestSamples.splice(0)
    const channel = channels.value[0]
    if (!channel) return

    const samples = channel.samples
    samples.push(...incoming)
    const latest = incoming.at(-1)?.timestamp ?? lastTimestamp.value
    trimSamples(samples, latest)
    channels.value = [
      { ...channel, samples, revision: channel.revision + 1 },
      ...channels.value.slice(1),
    ]
    lastTimestamp.value = latest
    updateInstanceValues(0, incoming.at(-1)?.ref ?? 0, incoming.at(-1)?.measure ?? 0)
  }

  function handleTestSample(sample: PidTestSample) {
    if (!testMode.value) return
    pendingTestSamples.push(sample)
    if (testFlushTimer !== undefined) return
    testFlushTimer = window.setTimeout(flushTestSamples, monitorFlushIntervalMs)
  }

  function clearPendingTestSamples() {
    if (testFlushTimer !== undefined) window.clearTimeout(testFlushTimer)
    testFlushTimer = undefined
    pendingTestSamples.length = 0
  }

  function setHistoryDurationMs(duration: number) {
    const normalized = Math.min(
      maximumHistoryDurationMs,
      Math.max(minimumHistoryDurationMs, Math.round(duration)),
    )
    historyDurationMs.value = normalized
    localStorage.setItem(historyDurationStorageKey, String(normalized))

    channels.value = channels.value.map((channel) => {
      if (!trimSamples(channel.samples, channel.samples.at(-1)?.timestamp ?? 0, true))
        return channel
      return { ...channel, revision: channel.revision + 1 }
    })
  }

  function setTestMode(enabled: boolean) {
    if (enabled === testMode.value) return true
    if (enabled && (connected.value || busy.value)) return false

    clearPendingTestSamples()
    testDataSource?.stop()
    testDataSource = undefined
    testMode.value = enabled

    if (!enabled) {
      instances.value = []
      channels.value = createEmptyChannels()
      lastTimestamp.value = 0
      return true
    }

    instances.value = [{ id: 0, name: '测试信号', kp: 0, ki: 0, kd: 0, ref: 0, measure: 0 }]
    channels.value = createEmptyChannels()
    channels.value[0] = { id: 0, pidId: 0, samples: [], revision: 1 }
    lastTimestamp.value = 0
    testDataSource = markRaw(new PidTestDataSource({ onSample: handleTestSample }))
    testDataSource.start()
    return true
  }

  function handleFrame(frame: ReceivedFrame) {
    if (frame.type === FrameType.PidInfo && frame.status === PidInfoStatus.Ok) {
      upsertInstance({
        id: frame.pidId,
        name: frame.name,
        kp: frame.kp,
        ki: frame.ki,
        kd: frame.kd,
        ref: 0,
        measure: 0,
      })
    }

    if (frame.type === FrameType.Monitor) {
      pendingMonitorFrames.push(frame)
      scheduleMonitorFlush()
    }

    if (
      frame.type === FrameType.Ack &&
      frame.commandType === FrameType.SetPid &&
      frame.status === AckStatus.Ok
    ) {
      const current = instances.value.find((item) => item.id === frame.pidId)
      if (current) upsertInstance({ ...current, kp: frame.kp, ki: frame.ki, kd: frame.kd })
    }

    for (const waiter of [...waiters]) {
      if (!waiter.predicate(frame)) continue
      window.clearTimeout(waiter.timer)
      waiters.splice(waiters.indexOf(waiter), 1)
      waiter.resolve(frame)
    }
  }

  function rejectWaiters(error: Error) {
    for (const waiter of waiters.splice(0)) {
      window.clearTimeout(waiter.timer)
      waiter.reject(error)
    }
  }

  function waitForFrame<T extends ReceivedFrame>(predicate: (frame: ReceivedFrame) => frame is T) {
    return new Promise<T>((resolve, reject) => {
      const waiter: FrameWaiter = {
        predicate,
        resolve: (frame) => resolve(frame as T),
        reject,
        timer: window.setTimeout(() => {
          const index = waiters.indexOf(waiter)
          if (index !== -1) waiters.splice(index, 1)
          reject(new Error('等待下位机响应超时'))
        }, responseTimeoutMs),
      }
      waiters.push(waiter)
    })
  }

  async function sendAndWait<T extends ReceivedFrame>(
    bytes: Uint8Array,
    predicate: (frame: ReceivedFrame) => frame is T,
  ) {
    if (!transport) throw new Error('串口尚未连接')
    const response = waitForFrame(predicate)
    try {
      await transport.send(bytes)
      return await response
    } catch (error) {
      const normalized = asError(error)
      rejectWaiters(normalized)
      throw normalized
    }
  }

  async function readPid(pidId: number) {
    let lastError: Error | undefined

    for (let attempt = 0; attempt < maxReadRetries; attempt += 1) {
      try {
        return await sendAndWait(
          encodeReadPid(pidId),
          (frame): frame is PidInfoFrame =>
            frame.type === FrameType.PidInfo && frame.pidId === pidId,
        )
      } catch (error) {
        lastError = asError(error)
      }
    }

    throw lastError ?? new Error(`读取 PID ${pidId} 失败`)
  }

  async function discoverPidInstances() {
    instances.value = []

    for (let pidId = 0; pidId < UNUSED_PID_ID; pidId += 1) {
      const response = await readPid(pidId)
      if (response.status === PidInfoStatus.NotFound) break
      if (response.status !== PidInfoStatus.Ok) {
        throw new Error(`未知 PID_INFO 状态：${response.status}`)
      }
    }
  }

  async function selectChannels(pidIds: readonly number[]) {
    const response = await sendAndWait(
      encodeSelectChannels(pidIds),
      (frame): frame is AckFrame =>
        frame.type === FrameType.Ack && frame.commandType === FrameType.SelectChannels,
    )
    if (response.status !== AckStatus.Ok) throw ackError(response.status)

    channels.value = channels.value.map((channel, index) => {
      const pidId = pidIds[index] ?? UNUSED_PID_ID
      return channel.pidId === pidId
        ? channel
        : { ...channel, pidId, samples: [], revision: channel.revision + 1 }
    })
  }

  async function setPid(pidId: number, kp: number, ki: number, kd: number) {
    const response = await sendAndWait(
      encodeSetPid(pidId, kp, ki, kd),
      (frame): frame is AckFrame =>
        frame.type === FrameType.Ack &&
        frame.commandType === FrameType.SetPid &&
        frame.pidId === pidId,
    )
    if (response.status !== AckStatus.Ok) throw ackError(response.status)
    return response
  }

  async function connect() {
    if (!supported || busy.value || connected.value) return

    setTestMode(false)

    if (transport) {
      await transport.disconnect().catch(() => undefined)
      transport = undefined
    }

    errorMessage.value = ''
    connectionStatus.value = 'connecting'
    clearPendingMonitorFrames()
    instances.value = []
    channels.value = createEmptyChannels()
    lastTimestamp.value = 0

    transport = markRaw(
      new PidSerialTransport({
        onFrame: handleFrame,
        onError: (error) => {
          errorMessage.value = error.message
          connectionStatus.value = 'error'
          rejectWaiters(error)
        },
        onDisconnect: () => {
          if (connectionStatus.value !== 'error') connectionStatus.value = 'disconnected'
          rejectWaiters(new Error('串口连接已断开'))
        },
      }),
    )

    try {
      await transport.connect()
      connectionStatus.value = 'discovering'
      await discoverPidInstances()
      const pidIds = instances.value.slice(0, 4).map((pid) => pid.id)
      while (pidIds.length < 4) pidIds.push(UNUSED_PID_ID)
      await selectChannels(pidIds)
      connectionStatus.value = 'connected'
    } catch (error) {
      const normalized = asError(error)
      errorMessage.value = normalized.message
      connectionStatus.value = 'error'
      rejectWaiters(normalized)
      await transport.disconnect().catch(() => undefined)
      transport = undefined
    }
  }

  async function disconnect() {
    clearPendingMonitorFrames()
    rejectWaiters(new Error('串口连接已断开'))
    await transport?.disconnect().catch((error) => {
      errorMessage.value = asError(error).message
    })
    transport = undefined
    connectionStatus.value = supported ? 'disconnected' : 'unsupported'
  }

  function getInstance(pidId: number) {
    return instances.value.find((pid) => pid.id === pidId)
  }

  return {
    connectionStatus,
    errorMessage,
    instances,
    channels,
    lastTimestamp,
    historyDurationMs,
    testMode,
    connected,
    busy,
    connect,
    disconnect,
    setHistoryDurationMs,
    setTestMode,
    discoverPidInstances,
    selectChannels,
    setPid,
    getInstance,
  }
})
