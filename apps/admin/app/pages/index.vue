<script setup lang="ts">
const api = useApi()
const { data, error, refresh, status } = await useAsyncData('overview', () => api<{ data: Overview }>('/v1/admin/overview').then((r) => r.data))

const totals = computed(() => {
  const c = data.value?.welfare.byCity ?? []
  return c.reduce((s, r) => ({ active: s.active + r.active, rejected: s.rejected + r.rejected, expired: s.expired + r.expired, pending: s.pending + r.pending }), { active: 0, rejected: 0, expired: 0, pending: 0 })
})

const cityChart = computed(() => {
  const rows = data.value?.welfare.byCity ?? []
  const series = (['active', 'rejected', 'expired', 'pending'] as const).map((k) => ({
    name: STATUS_LABEL[k], type: 'bar', stack: 'all', data: rows.map((r) => r[k]),
    color: { active: '#73aa00', rejected: '#d06262', expired: '#a8abb2', pending: '#ff9538' }[k],
  }))
  return {
    tooltip: { trigger: 'axis' }, legend: { top: 0 }, grid: { left: 40, right: 16, bottom: 30, top: 56 },
    xAxis: { type: 'category', data: rows.map((r) => r.city) }, yAxis: { type: 'value' }, series,
  }
})

const costChart = computed(() => {
  const d = data.value?.llm.daily ?? []
  return {
    tooltip: { trigger: 'axis' }, legend: { top: 0 }, grid: { left: 50, right: 50, bottom: 30, top: 56 },
    xAxis: { type: 'category', data: d.map((r) => r.day.slice(5)) },
    yAxis: [{ type: 'value', name: 'USD' }, { type: 'value', name: 'tokens', axisLabel: { formatter: (v: number) => fmtTokens(v) } }],
    series: [
      { name: '費用', type: 'bar', data: d.map((r) => Number(r.costUsd.toFixed(4))), color: '#73aa00' },
      { name: '輸入 tokens', type: 'line', yAxisIndex: 1, data: d.map((r) => r.inputTokens), color: '#3a90e0' },
      { name: '輸出 tokens', type: 'line', yAxisIndex: 1, data: d.map((r) => r.outputTokens + r.thoughtsTokens), color: '#e360da' },
    ],
  }
})

// el-table 的 row 型別是 DefaultRow
const rejectRate = (r: Record<string, number>) => {
  const n = (r.active ?? 0) + (r.rejected ?? 0) + (r.expired ?? 0) + (r.pending ?? 0)
  return n ? `${Math.round(((r.rejected ?? 0) / n) * 100)}%` : '—'
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold">總覽</h1>
      <el-button :loading="status === 'pending'" @click="refresh()">重新整理</el-button>
    </div>
    <el-alert v-if="error" :title="error.message" type="error" :closable="false" />
    <template v-if="data">
      <el-alert
        v-if="data.llm.paused"
        type="warning"
        :closable="false"
        :title="`Gemini 額度不足，結構化已於 ${fmtTime(data.llm.paused.at)} 暫停；儲值後會自動恢復（最後探測：${fmtTime(data.llm.paused.probedAt)}）`"
        :description="data.llm.paused.reason"
      />

      <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <Stat label="可搜尋的福利" :value="fmtNum(totals.active)" />
        <Stat label="判為非福利" :value="fmtNum(totals.rejected)" :hint="`人工修正 ${data.welfare.structure.overridden} 筆`" />
        <Stat label="已截止" :value="fmtNum(totals.expired)" />
        <Stat label="結構化錯誤" :value="fmtNum(data.welfare.structure.errors)" :hint="`規則版 ${data.welfare.structure.rules}、未結構化 ${data.welfare.structure.unstructured}`" />
        <Stat label="LLM 累計費用" :value="fmtUsd(data.llm.total.costUsd, 2)" :hint="`${fmtNum(data.llm.total.calls)} 次呼叫`" />
        <Stat label="使用者" :value="fmtNum(data.users.total)" :hint="`近 7 天 +${data.users.new7d}、近 30 天 +${data.users.new30d}`" />
      </div>

      <div class="grid xl:grid-cols-2 gap-5">
        <el-card shadow="never" header="各縣市福利數量"><Chart :option="cityChart" /></el-card>
        <el-card shadow="never" header="LLM 每日用量（近 30 天，台北時間）"><Chart :option="costChart" /></el-card>
      </div>

      <div class="grid xl:grid-cols-3 gap-5">
        <el-card shadow="never" header="各縣市明細" class="xl:col-span-2">
          <el-table :data="data.welfare.byCity" size="small">
            <el-table-column prop="city" label="縣市" />
            <el-table-column prop="active" label="可搜尋" align="right" />
            <el-table-column prop="rejected" label="非福利" align="right" />
            <el-table-column label="非福利比例" align="right">
              <template #default="{ row }">{{ rejectRate(row) }}</template>
            </el-table-column>
            <el-table-column prop="expired" label="已截止" align="right" />
            <el-table-column prop="pending" label="待處理" align="right" />
            <el-table-column width="90">
              <template #default="{ row }">
                <NuxtLink :to="{ path: '/welfare', query: { city: row.city, status: 'rejected' } }" class="text-xs text-blue-500">看非福利</NuxtLink>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
        <div class="space-y-5">
          <el-card shadow="never" header="使用者">
            <el-descriptions :column="1" size="small">
              <el-descriptions-item label="總數">{{ data.users.total }}（已驗證 {{ data.users.verified }}）</el-descriptions-item>
              <el-descriptions-item label="訂閱通知">{{ data.users.subscribed }}</el-descriptions-item>
              <el-descriptions-item label="收藏">{{ data.users.favorites }}</el-descriptions-item>
              <el-descriptions-item label="家庭">{{ data.users.families }}</el-descriptions-item>
            </el-descriptions>
          </el-card>
          <el-card shadow="never" header="結構化版本">
            <el-table :data="data.welfare.versions" size="small">
              <el-table-column label="模型"><template #default="{ row }">{{ row.model ?? '規則' }}</template></el-table-column>
              <el-table-column label="prompt"><template #default="{ row }"><code>{{ row.promptVersion ?? '—' }}</code></template></el-table-column>
              <el-table-column prop="count" label="筆數" align="right" />
            </el-table>
          </el-card>
        </div>
      </div>

      <el-card shadow="never">
        <template #header>爬蟲來源 <span class="text-xs text-gray-400 ml-2">最後一次推送：{{ fmtTime(data.sources.lastIngestAt) }}</span></template>
        <el-table :data="data.sources.sites" size="small">
          <el-table-column prop="siteId" label="站點" />
          <el-table-column prop="programs" label="福利數" align="right" />
          <el-table-column label="最後看到" align="right"><template #default="{ row }">{{ fmtTime(row.lastSeenAt) }}</template></el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>
