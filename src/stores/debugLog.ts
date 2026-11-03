import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

type LogRow = Readonly<{ receivedAt: number; text: string }>

const storageKey = 'pid-viewer.debug-log-limit'
export const minimumLogLimit = 100
export const maximumLogLimit = 10_000

export function isValidLogLimit(value: number) {
  return Number.isInteger(value) && value >= minimumLogLimit && value <= maximumLogLimit
}

export const useDebugLogStore = defineStore('debugLog', () => {
  const savedLimit = Number(localStorage.getItem(storageKey))
  const limit = ref(isValidLogLimit(savedLimit) ? savedLimit : maximumLogLimit)
  const rows = shallowRef<readonly LogRow[]>([])

  function append(entries: readonly LogRow[]) {
    if (!entries.length) return
    const drop = Math.max(0, rows.value.length + entries.length - limit.value)
    rows.value = [
      ...rows.value.slice(drop),
      ...entries.slice(Math.max(0, drop - rows.value.length)),
    ]
  }

  function setLimit(value: number) {
    if (!isValidLogLimit(value)) return
    localStorage.setItem(storageKey, String(value))
    limit.value = value
    if (rows.value.length > value) rows.value = rows.value.slice(-value)
  }

  function clear() {
    rows.value = []
  }

  return { rows, limit, append, setLimit, clear }
})
