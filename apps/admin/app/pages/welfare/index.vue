<script setup lang="ts">
import { CITIES } from '@mou-welfare/shared'

const api = useApi()
const route = useRoute()
const router = useRouter()

// 篩選條件存在網址上，從詳情頁返回時保留
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
const filters = reactive({
  q: str(route.query.q) ?? '',
  city: str(route.query.city),
  status: str(route.query.status),
  structuredBy: str(route.query.structuredBy),
  reviewed: str(route.query.reviewed),
  error: str(route.query.error),
  page: Number(route.query.page ?? 1),
})
const limit = 30

const query = computed(() =>
  Object.fromEntries(Object.entries({ ...filters, q: filters.q.trim() || undefined }).filter(([, v]) => v !== undefined && v !== '')),
)
const { data, status, error } = await useAsyncData(
  'welfare-list',
  () => api<Paged<WelfareRow>>('/v1/admin/welfare', { query: { ...query.value, limit } }),
  { watch: [query] },
)
watch(query, (q) => router.replace({ query: q as Record<string, string> }))
watch(() => [filters.q, filters.city, filters.status, filters.structuredBy, filters.reviewed, filters.error], () => (filters.page = 1))

// 詳情頁的「上一筆／下一筆」用目前這一頁的順序
watch(data, (d) => d && sessionStorage.setItem('admin:welfare-ids', JSON.stringify(d.data.map((r) => r.id))), { immediate: true })

const open = (row: WelfareRow) => navigateTo({ path: `/welfare/${row.id}`, query: { back: route.fullPath } })
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold">福利</h1>
    <el-card shadow="never">
      <div class="flex flex-wrap gap-3">
        <el-input v-model="filters.q" placeholder="名稱、program key 或 id" clearable class="!w-64" />
        <el-select v-model="filters.city" placeholder="縣市" clearable class="!w-32">
          <el-option v-for="c in CITIES" :key="c" :label="c" :value="c" />
        </el-select>
        <el-select v-model="filters.status" placeholder="狀態" clearable class="!w-32">
          <el-option v-for="(l, k) in STATUS_LABEL" :key="k" :label="l" :value="k" />
        </el-select>
        <el-select v-model="filters.structuredBy" placeholder="結構化方式" clearable class="!w-36">
          <el-option label="LLM" value="llm" /><el-option label="規則" value="rules" /><el-option label="未結構化" value="none" />
        </el-select>
        <el-select v-model="filters.reviewed" placeholder="人工檢核" clearable class="!w-32">
          <el-option label="已檢核" value="true" /><el-option label="未檢核" value="false" />
        </el-select>
        <el-select v-model="filters.error" placeholder="錯誤" clearable class="!w-32">
          <el-option label="有錯誤" value="true" />
        </el-select>
      </div>
    </el-card>
    <el-alert v-if="error" :title="error.message" type="error" :closable="false" />
    <el-card shadow="never">
      <template #header>共 {{ data?.meta.total ?? 0 }} 筆</template>
      <el-table v-loading="status === 'pending'" :data="data?.data ?? []" size="small" row-class-name="cursor-pointer" @row-click="open">
        <el-table-column label="名稱" min-width="260">
          <template #default="{ row }">
            <div class="font-medium">{{ row.name }}</div>
            <div class="text-xs text-gray-400 line-clamp-1">{{ row.summary }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="city" label="縣市" width="80" />
        <el-table-column label="狀態" width="130">
          <template #default="{ row }">
            <el-tag :type="STATUS_TYPE[row.status]" size="small">{{ STATUS_LABEL[row.status] }}</el-tag>
            <el-tag v-if="row.statusOverride" size="small" type="warning" class="ml-1">人工</el-tag>
            <el-tag v-if="row.pinnedAt" size="small" class="ml-1">置頂</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="身分" min-width="140">
          <template #default="{ row }"><span class="text-xs">{{ row.identities.join('、') || '—' }}</span></template>
        </el-table-column>
        <el-table-column label="結構化" width="110">
          <template #default="{ row }">
            <span class="text-xs">{{ row.structuredBy === 'llm' ? 'LLM' : row.structuredBy === 'rules' ? '規則' : '—' }}</span>
            <el-tag v-if="row.hasError" type="danger" size="small" class="ml-1">錯誤</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="檢核" width="70">
          <template #default="{ row }"><span class="text-xs">{{ row.reviewedAt ? '✓' : '' }}</span></template>
        </el-table-column>
        <el-table-column label="更新" width="140">
          <template #default="{ row }"><span class="text-xs">{{ fmtTime(row.updatedAt) }}</span></template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="filters.page"
        class="mt-4 justify-end"
        layout="total, prev, pager, next"
        :page-size="limit"
        :total="data?.meta.total ?? 0"
      />
    </el-card>
  </div>
</template>
