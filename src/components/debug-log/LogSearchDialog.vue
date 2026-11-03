<script setup lang="ts">
import DraggableDialogTitle from '@/components/DraggableDialogTitle.vue'
import { computed, ref, watch } from 'vue'

const props = defineProps<{ columnCount: number }>()
const search = defineModel<{ query: string; column: number }>('search', { required: true })
const open = ref(false)
const query = ref<string | null>('')
const column = ref(-1)

const scopes = computed(() => [
  { title: '全部列', value: -1 },
  ...Array.from({ length: Math.max(props.columnCount, column.value + 1) }, (_, index) => ({
    title: index === 0 ? '接收时间' : `日志字段 ${index}`,
    value: index,
  })),
])

watch(open, (visible) => {
  if (!visible) return
  query.value = search.value.query
  column.value = search.value.column
})

function apply() {
  const keyword = query.value?.trim() ?? ''
  search.value = { query: keyword, column: column.value }
  open.value = false
}

function reset() {
  search.value = { query: '', column: -1 }
  open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="440">
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        icon="mdi-magnify"
        :color="search.query ? 'primary' : undefined"
        :aria-label="search.query ? '搜索日志，筛选已启用' : '搜索日志'"
        :title="search.query ? '搜索日志（筛选已启用）' : '搜索日志'"
        size="small"
        variant="text"
      />
    </template>

    <v-card>
      <DraggableDialogTitle>搜索日志</DraggableDialogTitle>
      <form @submit.prevent="apply">
        <v-card-text>
          <v-text-field v-model="query" label="关键词" autofocus clearable />
          <v-select v-model="column" :items="scopes" label="搜索范围" hide-details />
        </v-card-text>

        <v-card-actions>
          <v-btn variant="text" @click="reset">清除筛选</v-btn>
          <v-spacer />
          <v-btn variant="text" @click="open = false">取消</v-btn>
          <v-btn type="submit" color="primary" variant="flat">搜索</v-btn>
        </v-card-actions>
      </form>
    </v-card>
  </v-dialog>
</template>
