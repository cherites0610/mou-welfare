<!-- 爬蟲監控（docs/admin.md §4.6）：排程狀態、各站最近一次的結果、最近的執行。執行中時每 30 秒自動更新 -->
<script setup lang="ts">
const api = useApi()
const { data, error, status, refresh } = await useAsyncData('scraper', () =>
  api<{ data: ScraperStatus }>('/v1/admin/scraper').then((r) => r.data),
)

const running = computed(() => data.value?.latest?.status === 'running')
let timer: ReturnType<typeof setInterval> | undefined
watch(running, (on) => {
  clearInterval(timer)
  if (on) timer = setInterval(() => refresh(), 30_000)
}, { immediate: true })
onBeforeUnmount(() => clearInterval(timer))

const latest = computed(() => data.value?.latest ?? null)
const problemSites = computed(() => (data.value?.sites ?? []).filter((s) => s.last && s.last.health !== 'ok'))
type SiteRow = ScraperStatus['sites'][number]
type RunRow = ScrapeRunSummary
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold">爬蟲</h1>
      <el-button :loading="status === 'pending'" @click="refresh()">重新整理</el-button>
    </div>
    <el-alert v-if="error" :title="error.message" type="error" :closable="false" />

    <template v-if="data">
      <el-alert v-if="data.overdue" type="error" :closable="false" show-icon
        :title="`排程逾期：預定 ${fmtTime(data.nextDueAt)} 執行，到現在還沒有開始`"
        description="請檢查主機的 crontab 與 ~/.local/state/mou-welfare-scraper/ 的紀錄（docs/scraper.md §10.4）。系統也已寄信通知。" />
      <el-alert v-else-if="latest?.status === 'interrupted'" type="error" :closable="false" show-icon
        :title="`最近一次執行（${latest.id}）中斷`" description="超過 4 小時沒有回報，程序可能被中斷。下一次排程會重新執行。" />
      <el-alert v-else-if="problemSites.length" type="warning" :closable="false" show-icon
        :title="`${problemSites.length} 個站點最近一次不是正常：${problemSites.map((s) => s.siteId).join('、')}`"
        description="不正常的站點不會推送，也不會判定下架；其他站照常更新。點下方的站點看原因。" />

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="最近一次" :value="latest ? RUN_STATUS_LABEL[latest.status] ?? latest.status : '尚未執行'"
          :hint="latest ? `${fmtTime(latest.startedAt)}（${TRIGGER_LABEL[latest.trigger] ?? latest.trigger}）` : '排程啟用後第一次執行會出現在這裡'" />
        <Stat label="進度" :value="latest ? `${latest.done} / ${latest.planned} 站` : '—'"
          :hint="running ? `正在跑：${latest?.current ?? '—'}` : latest ? `耗時 ${fmtDuration(latest.startedAt, latest.finishedAt)}` : ''" />
        <Stat label="下一次預定" :value="fmtTime(data.nextDueAt)" :hint="`每 ${data.intervalDays} 天，凌晨 2:23 檢查`" />
        <Stat label="最近一次推送" :value="latest ? fmtNum(latest.totals.pushed) : '—'"
          :hint="latest ? `新增 ${latest.totals.new}、更新 ${latest.totals.updated}、下架 ${latest.totals.removed}` : ''" />
      </div>

      <el-card shadow="never">
        <template #header>各站最近一次的結果 <span class="text-xs text-gray-400 ml-2">點一列看那次執行的錯誤與隔離清單</span></template>
        <el-table :data="data.sites" size="small" row-class-name="cursor-pointer"
          @row-click="(r: SiteRow) => r.runId && navigateTo(`/scraper/${r.runId}#${r.siteId}`)">
          <el-table-column label="站點" width="130">
            <template #default="{ row }">{{ row.siteId }} <span class="text-gray-400">{{ row.city }}</span></template>
          </el-table-column>
          <el-table-column label="狀態" width="140">
            <template #default="{ row }">
              <el-tooltip v-if="row.last" :content="row.last.healthDetail || '正常'" placement="top">
                <el-tag :type="HEALTH_TYPE[row.last.health]" size="small">{{ HEALTH_LABEL[row.last.health] ?? row.last.health }}</el-tag>
              </el-tooltip>
              <span v-else class="text-gray-400">尚未執行</span>
            </template>
          </el-table-column>
          <el-table-column label="看到" align="right"><template #default="{ row }">{{ fmtNum(row.last?.seen) }}</template></el-table-column>
          <el-table-column label="新增" align="right"><template #default="{ row }">{{ fmtNum(row.last?.new) }}</template></el-table-column>
          <el-table-column label="更新" align="right"><template #default="{ row }">{{ fmtNum(row.last?.updated) }}</template></el-table-column>
          <el-table-column label="下架" align="right"><template #default="{ row }">{{ fmtNum(row.last?.removed) }}</template></el-table-column>
          <el-table-column label="推送" align="right"><template #default="{ row }">{{ fmtNum(row.last?.pushed) }}</template></el-table-column>
          <el-table-column label="隔離" align="right"><template #default="{ row }">{{ fmtNum(row.last?.quarantined) }}</template></el-table-column>
          <el-table-column label="錯誤" align="right">
            <template #default="{ row }"><span :class="row.last?.errorCount ? 'text-red-500' : ''">{{ fmtNum(row.last?.errorCount) }}</span></template>
          </el-table-column>
          <el-table-column label="可搜尋／福利" align="right" width="110">
            <template #default="{ row }">{{ row.programs.active }} / {{ row.programs.total }}</template>
          </el-table-column>
          <el-table-column label="最後正常" width="140"><template #default="{ row }">{{ fmtTime(row.lastOkAt) }}</template></el-table-column>
        </el-table>
      </el-card>

      <el-card shadow="never" header="最近的執行">
        <el-table :data="data.runs" size="small" row-class-name="cursor-pointer" empty-text="還沒有執行紀錄"
          @row-click="(r: RunRow) => navigateTo(`/scraper/${r.id}`)">
          <el-table-column label="開始" width="140"><template #default="{ row }">{{ fmtTime(row.startedAt) }}</template></el-table-column>
          <el-table-column label="狀態" width="90">
            <template #default="{ row }"><el-tag :type="RUN_STATUS_TYPE[row.status]" size="small">{{ RUN_STATUS_LABEL[row.status] ?? row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="方式" width="70"><template #default="{ row }">{{ TRIGGER_LABEL[row.trigger] ?? row.trigger }}</template></el-table-column>
          <el-table-column label="站點" width="80" align="right"><template #default="{ row }">{{ row.done }} / {{ row.planned }}</template></el-table-column>
          <el-table-column label="耗時" width="110"><template #default="{ row }">{{ fmtDuration(row.startedAt, row.finishedAt ?? (row.status === 'running' ? new Date().toISOString() : row.updatedAt)) }}</template></el-table-column>
          <el-table-column label="看到" align="right"><template #default="{ row }">{{ fmtNum(row.totals.seen) }}</template></el-table-column>
          <el-table-column label="新增／更新" align="right"><template #default="{ row }">{{ row.totals.new }} / {{ row.totals.updated }}</template></el-table-column>
          <el-table-column label="下架" align="right"><template #default="{ row }">{{ fmtNum(row.totals.removed) }}</template></el-table-column>
          <el-table-column label="推送" align="right"><template #default="{ row }">{{ fmtNum(row.totals.pushed) }}</template></el-table-column>
          <el-table-column label="異常站點" align="right">
            <template #default="{ row }"><span :class="row.totals.notOk ? 'text-orange-500 font-bold' : ''">{{ row.totals.notOk }}</span></template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>
