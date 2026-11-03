import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

type ToastType = 'info' | 'success' | 'warning' | 'error'
type ToastAction = { label: string; run: () => void }
type Toast = { id: number; message: string; type: ToastType; action?: ToastAction }

export const useToastStore = defineStore('toast', () => {
  const queue = ref<Toast[]>([])
  const capacity = ref(0)
  const visible = computed(() => queue.value.slice(0, capacity.value))
  let nextId = 0

  function show(message: string, type: ToastType = 'info', action?: ToastAction) {
    queue.value.push({ id: nextId++, message, type, action })
  }

  function dismiss(id: number) {
    queue.value = queue.value.filter((toast) => toast.id !== id)
  }

  function runAction(id: number) {
    const action = visible.value.find((toast) => toast.id === id)?.action
    if (!action) return
    dismiss(id)
    action.run()
  }

  return { capacity, visible, show, dismiss, runAction }
})
