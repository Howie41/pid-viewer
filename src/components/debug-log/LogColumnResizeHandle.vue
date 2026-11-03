<script setup lang="ts">
const width = defineModel<number>('width', { required: true })
defineProps<{ label: string }>()

let drag: { pointerId: number; x: number; width: number } | undefined

function resizeTo(value: number) {
  width.value = Math.max(80, value)
}

function startResize(event: PointerEvent) {
  if (event.button !== 0 || drag) return
  const handle = event.currentTarget as HTMLButtonElement
  handle.setPointerCapture(event.pointerId)
  drag = { pointerId: event.pointerId, x: event.clientX, width: width.value }
}

function moveResize(event: PointerEvent) {
  if (drag?.pointerId === event.pointerId) {
    resizeTo(drag.width + event.clientX - drag.x)
  }
}

function endResize(event: PointerEvent) {
  if (drag?.pointerId === event.pointerId) drag = undefined
}
</script>

<template>
  <div class="column-boundary" role="columnheader" :aria-label="label">
    <button
      type="button"
      class="column-resize-handle"
      :aria-label="`调整${label}宽度，使用左右方向键`"
      title="拖动调整列宽"
      @pointerdown="startResize"
      @pointermove="moveResize"
      @lostpointercapture="endResize"
      @keydown.left.prevent="resizeTo(width - 8)"
      @keydown.right.prevent="resizeTo(width + 8)"
    />
  </div>
</template>

<style scoped>
.column-boundary {
  position: relative;
  align-self: stretch;
}

.column-resize-handle {
  position: absolute;
  inset: 0 0 0 auto;
  width: 12px;
  cursor: col-resize;
  touch-action: none;
  user-select: none;
}

.column-resize-handle::after {
  position: absolute;
  inset: 25% 5px;
  background: currentColor;
  opacity: 0.35;
  content: '';
}

.column-resize-handle:is(:hover, :focus-visible, :active)::after {
  opacity: 1;
}
</style>
