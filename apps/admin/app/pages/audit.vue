<script setup lang="ts">
const api = useApi()
const targetType = ref<string | undefined>()
const page = ref(1)
const limit = 50
const query = computed(() => ({ targetType: targetType.value, page: page.value, limit }))
const { data, status, error } = await useAsyncData('audit', () => api<Paged<Audit>>('/v1/admin/audit', { query: query.value }), { watch: [query] })
watch(targetType, () => (page.value = 1))
// el-table 的 row 型別是 DefaultRow
const link = (a: Record<string, string>) => (a.targetType === 'welfare' ? `/welfare/${a.targetId}` : a.targetType === 'user' ? `/users/${a.targetId}` : null)
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold">稽核紀錄</h1>
    <el-card shadow="never">
      <el-select v-model="targetType" placeholder="對象" clearable class="!w-40">
        <el-option label="福利" value="welfare" /><el-option label="使用者" value="user" />
      </el-select>
    </el-card>
    <el-alert v-if="error" :title="error.message" type="error" :closable="false" />
    <el-card shadow="never">
      <el-table v-loading="status === 'pending'" :data="data?.data ?? []" size="small">
        <el-table-column label="時間" width="140"><template #default="{ row }">{{ fmtTime(row.at) }}</template></el-table-column>
        <el-table-column prop="adminEmail" label="管理者" width="220" />
        <el-table-column label="動作" width="110"><template #default="{ row }">{{ ACTION_LABEL[row.action] ?? row.action }}</template></el-table-column>
        <el-table-column label="對象" width="300">
          <template #default="{ row }">
            <NuxtLink v-if="link(row)" :to="link(row)!" class="text-blue-500 text-xs"><code>{{ row.targetType }}:{{ row.targetId }}</code></NuxtLink>
          </template>
        </el-table-column>
        <el-table-column label="內容"><template #default="{ row }"><code class="text-xs">{{ JSON.stringify(row.detail) }}</code></template></el-table-column>
        <el-table-column prop="ip" label="IP" width="130" />
      </el-table>
      <el-pagination v-model:current-page="page" class="mt-4 justify-end" layout="total, prev, pager, next" :page-size="limit" :total="data?.meta.total ?? 0" />
    </el-card>
  </div>
</template>
