<script setup lang="ts">
import { ref } from 'vue'
import DraggableDialogTitle from '@/components/DraggableDialogTitle.vue'
import { usePidHistoryStore } from '@/stores/pidHistory'
import { useToastStore } from '@/stores/toast'

const open = ref(false)
const history = usePidHistoryStore()
const toast = useToastStore()

async function copyParameters({ name, kp, ki, kd }: (typeof history.records)[number]) {
  const label = `「${name || '空名称'}」`
  const text = `{
    .kp = ${kp},
    .ki = ${ki},
    .kd = ${kd}
}`
  try {
    await navigator.clipboard.writeText(text)
    toast.show(`已复制 ${label} 的 PID 参数`, 'success')
  } catch {
    toast.show(`无法复制 ${label} 的 PID 参数`, 'error')
  }
}

function removeRecord(name: string) {
  const undo = history.remove(name)
  if (!undo) return
  const label = `「${name || '空名称'}」`
  toast.show(
    history.errorMessage ? `${label}：${history.errorMessage}` : `已删除 ${label} 的历史记录`,
    history.errorMessage ? 'warning' : 'success',
    {
      label: '撤销',
      run: () => {
        if (!undo()) {
          toast.show(`${label} 已有新记录，已保留当前记录`)
          return
        }
        toast.show(
          history.errorMessage ? `${label}：${history.errorMessage}` : `已恢复 ${label} 的历史记录`,
          history.errorMessage ? 'warning' : 'success',
        )
      },
    },
  )
}

function clearRecords() {
  const count = history.records.length
  const undo = history.clear()
  if (!undo) return
  toast.show(
    history.errorMessage || `已清空 ${count} 条 PID 历史记录`,
    history.errorMessage ? 'warning' : 'success',
    {
      label: '撤销',
      run: () => {
        const restored = undo()
        if (!restored) {
          toast.show('原记录已有同名新记录，已保留当前记录')
          return
        }
        toast.show(
          history.errorMessage || `已恢复 ${restored} 条 PID 历史记录`,
          history.errorMessage ? 'warning' : 'success',
        )
      },
    },
  )
}
</script>

<template>
  <v-dialog v-model="open" max-width="680" scrollable>
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        icon="mdi-history"
        aria-label="PID 参数历史记录"
        title="PID 参数历史记录"
        size="small"
        variant="text"
      />
    </template>

    <v-card>
      <DraggableDialogTitle class="d-flex align-center">
        <span>PID 参数历史记录</span>
        <v-spacer />
        <v-btn
          icon="mdi-close"
          aria-label="关闭"
          size="small"
          variant="text"
          @click="open = false"
        />
      </DraggableDialogTitle>
      <v-card-text>
        <v-alert v-if="history.errorMessage" class="mb-4" type="warning" variant="tonal">
          {{ history.errorMessage }}
        </v-alert>
        <v-table v-if="history.records.length" density="compact">
          <thead>
            <tr>
              <th scope="col">PID 名称</th>
              <th scope="col">Kp</th>
              <th scope="col">Ki</th>
              <th scope="col">Kd</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in history.records" :key="record.name">
              <td>{{ record.name || '（空名称）' }}</td>
              <td>{{ record.kp }}</td>
              <td>{{ record.ki }}</td>
              <td>{{ record.kd }}</td>
              <td class="text-no-wrap">
                <v-btn
                  icon="mdi-content-copy"
                  :aria-label="`复制 PID ${record.name || '（空名称）'} 的参数`"
                  title="复制参数"
                  size="small"
                  variant="text"
                  @click="copyParameters(record)"
                />
                <v-btn
                  icon="mdi-delete-outline"
                  :aria-label="`删除 PID ${record.name || '（空名称）'} 的记录`"
                  title="删除记录"
                  size="small"
                  variant="text"
                  @click="removeRecord(record.name)"
                />
              </td>
            </tr>
          </tbody>
        </v-table>
        <p v-else class="text-medium-emphasis">暂无 PID 参数历史记录</p>
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="error"
          variant="text"
          :disabled="!history.records.length"
          @click="clearRecords"
        >
          清空历史
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
