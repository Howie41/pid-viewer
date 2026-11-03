<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

const title = useTemplateRef('title')
let content: HTMLElement | null = null
let x = 0
let y = 0
let drag: { id: number; x: number; y: number; left: number; top: number } | undefined

function moveTo(left: number, top: number) {
  if (!content) return
  const rect = content.getBoundingClientRect()
  const baseLeft = rect.left - x
  const baseTop = rect.top - y
  const maxLeft = Math.max(0, document.documentElement.clientWidth - rect.width)
  const maxTop = Math.max(0, document.documentElement.clientHeight - rect.height)
  x = Math.min(maxLeft, Math.max(0, baseLeft + left)) - baseLeft
  y = Math.min(maxTop, Math.max(0, baseTop + top)) - baseTop
  content.style.translate = `${x}px ${y}px`
}

function keepInViewport() {
  if (x || y) moveTo(x, y)
}

function startDrag(event: PointerEvent) {
  if (!content || drag || event.button !== 0 || !event.isPrimary) return
  if (
    event.target instanceof Element &&
    event.target.closest('button, a, input, select, textarea, [role="button"], [contenteditable]')
  )
    return

  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: x, top: y }
  event.preventDefault()
}

function moveDrag(event: PointerEvent) {
  if (drag?.id !== event.pointerId) return
  moveTo(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y)
}

function endDrag(event: PointerEvent) {
  if (drag?.id === event.pointerId) drag = undefined
}

onMounted(() => {
  const element = title.value?.$el as HTMLElement | undefined
  content = element?.closest<HTMLElement>('.v-overlay__content') ?? null
  window.addEventListener('resize', keepInViewport)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', keepInViewport)
  if (content) content.style.translate = ''
})
</script>

<template>
  <v-card-title
    ref="title"
    class="dialog-drag-title"
    @pointerdown="startDrag"
    @pointermove="moveDrag"
    @lostpointercapture="endDrag"
  >
    <slot />
  </v-card-title>
</template>

<style scoped>
.dialog-drag-title {
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.dialog-drag-title:active {
  cursor: grabbing;
}
</style>
