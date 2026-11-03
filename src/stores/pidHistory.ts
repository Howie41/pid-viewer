import { defineStore } from 'pinia'
import { ref } from 'vue'

type PidHistoryRecord = { name: string; kp: number; ki: number; kd: number }

const storageKey = 'pid-viewer.pid-parameter-history-by-name'

function isRecord(value: unknown): value is PidHistoryRecord {
  if (!value || typeof value !== 'object') return false
  const { name, kp, ki, kd } = value as Partial<PidHistoryRecord>
  return (
    typeof name === 'string' &&
    [kp, ki, kd].every((parameter) => typeof parameter === 'number' && Number.isFinite(parameter))
  )
}

export const usePidHistoryStore = defineStore('pidHistory', () => {
  const records = ref<PidHistoryRecord[]>([])
  const errorMessage = ref('')

  try {
    const stored = localStorage.getItem(storageKey)
    if (stored !== null) {
      const parsed: unknown = JSON.parse(stored)
      if (!Array.isArray(parsed)) throw new Error('Invalid PID history')
      const unique = new Map<string, PidHistoryRecord>()
      for (const record of parsed) {
        if (isRecord(record) && !unique.has(record.name)) unique.set(record.name, record)
      }
      records.value = [...unique.values()]
    }
  } catch {
    errorMessage.value = '无法读取浏览器中的 PID 历史记录'
  }

  function persist(next: PidHistoryRecord[]) {
    records.value = next
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
      errorMessage.value = ''
    } catch {
      errorMessage.value = '无法保存 PID 历史记录，当前改动仅在本次页面打开期间有效'
    }
  }

  function record(name: string, kp: number, ki: number, kd: number) {
    persist([
      { name, kp: Math.fround(kp), ki: Math.fround(ki), kd: Math.fround(kd) },
      ...records.value.filter((item) => item.name !== name),
    ])
  }

  function remove(name: string) {
    const index = records.value.findIndex((item) => item.name === name)
    const removed = records.value[index]
    if (!removed) return

    persist(records.value.filter((item) => item.name !== name))
    return () => {
      if (records.value.some((item) => item.name === name)) return false
      const next = records.value.slice()
      next.splice(index, 0, removed)
      persist(next)
      return true
    }
  }

  function clear() {
    const cleared = records.value
    if (!cleared.length) return

    persist([])
    return () => {
      const currentNames = new Set(records.value.map((item) => item.name))
      const restorable = cleared.filter((item) => !currentNames.has(item.name))
      if (restorable.length) persist([...records.value, ...restorable])
      return restorable.length
    }
  }

  return { records, errorMessage, record, remove, clear }
})
