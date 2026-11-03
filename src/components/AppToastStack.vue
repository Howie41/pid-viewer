<script setup lang="ts">
import { onBeforeUnmount, watch, watchEffect } from 'vue'
import { useDisplay, useLayout } from 'vuetify'
import { useToastStore } from '@/stores/toast'

const toasts = useToastStore()
const { mainStyles } = useLayout()
const { height: viewportHeight } = useDisplay()
const duration = 5000
const toastHeight = 72
const toastGap = 8
const edgeInset = 12
const timers = new Map<number, number>()
const icons = {
  info: 'mdi-information-outline',
  success: 'mdi-check-circle-outline',
  warning: 'mdi-alert-outline',
  error: 'mdi-alert-circle-outline',
}

watchEffect(() => {
  const toolbarHeight = Number.parseFloat(String(mainStyles.value['--v-layout-top'])) || 0
  const available = viewportHeight.value - toolbarHeight - 2 * edgeInset
  toasts.capacity = Math.min(
    7,
    Math.max(0, Math.floor((available + toastGap) / (toastHeight + toastGap))),
  )
})

watch(
  () => toasts.visible,
  (visible) => {
    for (const [id, timer] of timers) {
      if (visible.some((toast) => toast.id === id)) continue
      window.clearTimeout(timer)
      timers.delete(id)
    }

    for (const { id } of visible) {
      if (!timers.has(id)) {
        timers.set(
          id,
          window.setTimeout(() => toasts.dismiss(id), duration),
        )
      }
    }
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => {
  for (const timer of timers.values()) window.clearTimeout(timer)
})

function pinLeavingToast(element: Element) {
  if (element instanceof HTMLElement) element.style.top = `${element.offsetTop}px`
}
</script>

<template>
  <TransitionGroup
    tag="div"
    name="toast"
    class="toast-stack position-fixed pointer-events-none d-flex flex-column"
    aria-label="操作通知"
    :style="[
      mainStyles,
      {
        '--toast-duration': `${duration}ms`,
        '--toast-inset': `${edgeInset}px`,
        gap: `${toastGap}px`,
      },
    ]"
    @before-leave="pinLeavingToast"
  >
    <div v-for="toast in toasts.visible" :key="toast.id">
      <v-snackbar
        :model-value="true"
        :timeout="-1"
        :transition="false"
        :min-width="0"
        :height="toastHeight"
        :content-props="{ class: 'position-relative w-100 ma-0 border' }"
        attach
        color="surface"
        location="top end"
        class="position-static ma-0 pa-0"
        @update:model-value="(open) => !open && toasts.dismiss(toast.id)"
      >
        <div class="d-flex align-start ga-2">
          <v-icon :icon="icons[toast.type]" :color="toast.type" size="small" />
          <span class="toast-message text-break" :title="toast.message">{{ toast.message }}</span>
        </div>
        <v-progress-linear
          :model-value="100"
          :color="toast.type"
          height="3"
          location="bottom"
          class="toast-countdown position-absolute bottom-0 left-0"
          aria-hidden="true"
        />
        <template v-if="toast.action" #actions>
          <v-btn
            :text="toast.action.label"
            size="small"
            variant="text"
            @click="toasts.runAction(toast.id)"
          />
        </template>
      </v-snackbar>
    </div>
  </TransitionGroup>
</template>

<style scoped>
.toast-stack {
  z-index: 10000;
  inset: calc(var(--v-layout-top, 0px) + var(--toast-inset)) var(--toast-inset) auto auto;
  width: min(380px, calc(100% - 2 * var(--toast-inset)));
}

.toast-stack :deep(.v-snackbar__content) {
  min-width: 0;
}

.toast-message {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.toast-countdown {
  transform-origin: left;
  animation: toast-countdown var(--toast-duration) linear forwards;
}

.toast-move,
.toast-enter-active,
.toast-leave-active {
  transition:
    transform 200ms ease,
    opacity 200ms ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(16px);
}

.toast-leave-active {
  position: absolute;
  inset-inline: 0;
}

.toast-leave-active :deep(.v-snackbar__wrapper) {
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .toast-move,
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}

@keyframes toast-countdown {
  to {
    transform: scaleX(0);
  }
}
</style>
