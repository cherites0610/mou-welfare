<script setup lang="ts">
const api = useApi()
const days = ref(30)
const { data, error, status } = await useAsyncData('llm-usage', () => api<{ data: LlmUsage }>('/v1/admin/llm-usage', { query: { days: days.value } }).then((r) => r.data), { watch: [days] })

const totals = computed(() =>
  (data.value?.rows ?? []).reduce(
    (s, r) => ({ calls: s.calls + r.calls, errors: s.errors + r.errors, input: s.input + r.inputTokens, output: s.output + r.outputTokens + r.thoughtsTokens, cost: s.cost + r.costUsd }),
    { calls: 0, errors: 0, input: 0, output: 0, cost: 0 },
  ),
)

// 每日費用，依用途堆疊
const chart = computed(() => {
  const rows = data.value?.rows ?? []
  const daysList = [...new Set(rows.map((r) => r.day))].sort()
  const purposes = [...new Set(rows.map((r) => r.purpose))]
  return {
    tooltip: { trigger: 'axis' }, legend: { top: 0 }, grid: { left: 50, right: 16, bottom: 30, top: 56 },
    xAxis: { type: 'category', data: daysList.map((d) => d.slice(5)) }, yAxis: { type: 'value', name: 'USD' },
    series: purposes.map((p) => ({
      name: PURPOSE_LABEL[p] ?? p, type: 'bar', stack: 'cost',
      data: daysList.map((d) => Number(rows.filter((r) => r.day === d && r.purpose === p).reduce((s, r) => s + r.costUsd, 0).toFixed(4))),
    })),
  }
})
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold">LLM 用量</h1>
      <el-radio-group v-model="days">
        <el-radio-button :value="7">7 天</el-radio-button>
        <el-radio-button :value="30">30 天</el-radio-button>
        <el-radio-button :value="90">90 天</el-radio-button>
        <el-radio-button :value="365">一年</el-radio-button>
      </el-radio-group>
    </div>
    <el-alert v-if="error" :title="error.message" type="error" :closable="false" />
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Stat label="呼叫次數" :value="fmtNum(totals.calls)" />
      <Stat label="失敗" :value="fmtNum(totals.errors)" />
      <Stat label="輸入 tokens" :value="fmtTokens(totals.input)" />
      <Stat label="輸出 tokens（含思考）" :value="fmtTokens(totals.output)" />
      <Stat label="預估費用" :value="fmtUsd(totals.cost, 3)" hint="依 lib/llm/pricing.ts，實際以 AI Studio 帳單為準" />
    </div>
    <el-card shadow="never" header="每日費用（依用途）"><Chart :option="chart" /></el-card>
    <el-card shadow="never" header="明細（台北時間，依日期／用途／模型）">
      <el-table v-loading="status === 'pending'" :data="data?.rows ?? []" size="small" max-height="480">
        <el-table-column prop="day" label="日期" width="110" />
        <el-table-column label="用途" width="100"><template #default="{ row }">{{ PURPOSE_LABEL[row.purpose] ?? row.purpose }}</template></el-table-column>
        <el-table-column prop="model" label="模型" min-width="180" />
        <el-table-column label="次數" align="right"><template #default="{ row }">{{ fmtNum(row.calls) }}</template></el-table-column>
        <el-table-column label="失敗" align="right"><template #default="{ row }">{{ fmtNum(row.errors) }}</template></el-table-column>
        <el-table-column label="輸入" align="right"><template #default="{ row }">{{ fmtNum(row.inputTokens) }}</template></el-table-column>
        <el-table-column label="輸出" align="right"><template #default="{ row }">{{ fmtNum(row.outputTokens) }}</template></el-table-column>
        <el-table-column label="思考" align="right"><template #default="{ row }">{{ fmtNum(row.thoughtsTokens) }}</template></el-table-column>
        <el-table-column label="平均毫秒" align="right"><template #default="{ row }">{{ fmtNum(row.avgLatencyMs) }}</template></el-table-column>
        <el-table-column label="費用" align="right"><template #default="{ row }">{{ fmtUsd(row.costUsd) }}</template></el-table-column>
      </el-table>
      <p class="text-xs text-gray-400 mt-2">Embedding 的 API 不回報 token 數，所以沒有費用（全量約 0.07 美元）。</p>
    </el-card>
    <div class="grid xl:grid-cols-2 gap-5">
      <el-card shadow="never" header="錯誤">
        <el-table :data="data?.errors ?? []" size="small" empty-text="沒有錯誤">
          <el-table-column prop="kind" label="類型" width="100" />
          <el-table-column prop="count" label="次數" width="80" align="right" />
          <el-table-column label="最近" width="140"><template #default="{ row }">{{ fmtTime(row.lastAt) }}</template></el-table-column>
          <el-table-column label="訊息"><template #default="{ row }"><span class="text-xs">{{ row.sample }}</span></template></el-table-column>
        </el-table>
      </el-card>
      <el-card shadow="never" header="花費最多的福利">
        <el-table :data="data?.topPrograms ?? []" size="small" row-class-name="cursor-pointer" @row-click="(r: LlmUsage['topPrograms'][number]) => navigateTo(`/welfare/${r.programId}`)">
          <el-table-column prop="name" label="名稱" />
          <el-table-column prop="city" label="縣市" width="80" />
          <el-table-column prop="calls" label="次數" width="70" align="right" />
          <el-table-column label="費用" width="100" align="right"><template #default="{ row }">{{ fmtUsd(row.costUsd) }}</template></el-table-column>
        </el-table>
      </el-card>
    </div>
  </div>
</template>
