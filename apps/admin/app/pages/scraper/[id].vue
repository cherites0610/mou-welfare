<!-- 單次爬蟲執行（docs/admin.md §4.6）：各站結果、錯誤、隔離清單 -->
<script setup lang="ts">
const route = useRoute()
const api = useApi()
const id = computed(() => String(route.params.id))
const { data, error } = await useAsyncData(`scraper-run-${id.value}`, () =>
  api<{ data: ScrapeRun }>(`/v1/admin/scraper/runs/${id.value}`).then((r) => r.data),
)
// 從列表點某一站進來時（#siteId）只展開那一站
const expanded = ref<string[]>(route.hash ? [route.hash.slice(1)] : [])
watch(data, (d) => {
  if (d && !expanded.value.length) expanded.value = d.sites.filter((s) => s.health !== 'ok').map((s) => s.siteId)
}, { immediate: true })
const missing = computed(() => (data.value ? data.value.plannedSites.filter((p) => !data.value!.sites.some((s) => s.siteId === p)) : []))
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center gap-3">
      <el-button text @click="navigateTo('/scraper')"><Icon icon="mdi:arrow-left" /> 爬蟲</el-button>
      <h1 class="text-xl font-bold">執行 {{ id }}</h1>
      <el-tag v-if="data" :type="RUN_STATUS_TYPE[data.status]">{{ RUN_STATUS_LABEL[data.status] ?? data.status }}</el-tag>
    </div>
    <el-alert v-if="error" :title="error.message" type="error" :closable="false" />

    <template v-if="data">
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="開始" :value="fmtTime(data.startedAt)" :hint="TRIGGER_LABEL[data.trigger] ?? data.trigger" />
        <Stat label="耗時" :value="fmtDuration(data.startedAt, data.finishedAt ?? data.updatedAt)" :hint="data.finishedAt ? '' : `最後回報 ${fmtTime(data.updatedAt)}`" />
        <Stat label="站點" :value="`${data.done} / ${data.planned}`" :hint="data.current ? `正在跑：${data.current}` : ''" />
        <Stat label="推送" :value="fmtNum(data.totals.pushed)" :hint="`新增 ${data.totals.new}、更新 ${data.totals.updated}、下架 ${data.totals.removed}`" />
        <Stat label="錯誤／隔離" :value="`${fmtNum(data.totals.errors)} / ${fmtNum(data.totals.quarantined)}`" />
      </div>
      <el-alert v-if="missing.length && data.status !== 'running'" type="warning" :closable="false"
        :title="`沒有跑到的站點：${missing.join('、')}`" />

      <el-collapse v-model="expanded">
        <el-collapse-item v-for="s in data.sites" :id="s.siteId" :key="s.siteId" :name="s.siteId">
          <template #title>
            <div class="flex items-center gap-3 w-full px-3">
              <span class="font-bold w-28">{{ s.siteId }} <span class="text-gray-400 font-normal">{{ s.city }}</span></span>
              <el-tag :type="HEALTH_TYPE[s.health]" size="small">{{ HEALTH_LABEL[s.health] ?? s.health }}</el-tag>
              <span class="text-xs text-gray-500 truncate">{{ s.healthDetail }}</span>
              <span class="ml-auto text-xs text-gray-500 whitespace-nowrap">
                看到 {{ s.seen }}・新增 {{ s.new }}・更新 {{ s.updated }}・下架 {{ s.removed }}・推送 {{ s.pushed }}・隔離 {{ s.quarantined }}・錯誤 {{ s.errorCount }}・{{ fmtDuration(s.startedAt, s.finishedAt) }}
              </span>
            </div>
          </template>
          <div class="space-y-4 px-3">
            <p class="text-xs text-gray-500">
              抓取 {{ s.pages }} 頁，標題規則排除 {{ s.filtered }}、內容沒變 {{ s.unchanged }}<template v-if="s.pushFailed">、<span class="text-red-500">推送失敗 {{ s.pushFailed }}</span></template>。
              <template v-if="s.health !== 'ok'">這一站不正常，這次沒有推送，也沒有判定下架。</template>
            </p>
            <div v-if="s.errors.length">
              <h3 class="text-sm font-bold mb-1">錯誤<span v-if="s.errorCount > s.errors.length" class="text-xs text-gray-400 font-normal">（共 {{ s.errorCount }} 筆，顯示前 {{ s.errors.length }} 筆）</span></h3>
              <ul class="text-xs font-mono space-y-0.5 max-h-64 overflow-auto bg-gray-50 rounded p-2">
                <li v-for="(e, i) in s.errors" :key="i" class="break-all">{{ e }}</li>
              </ul>
            </div>
            <div v-if="s.quarantine.length">
              <h3 class="text-sm font-bold mb-1">隔離（不推送）<span v-if="s.quarantined > s.quarantine.length" class="text-xs text-gray-400 font-normal">（共 {{ s.quarantined }} 筆）</span></h3>
              <el-table :data="s.quarantine" size="small" max-height="320">
                <el-table-column label="標題"><template #default="{ row }"><a :href="row.url" target="_blank" rel="noopener" class="text-mygreen-300 hover:underline">{{ row.title || '（無標題）' }}</a></template></el-table-column>
                <el-table-column label="原因" width="220"><template #default="{ row }">{{ row.issues.join('、') }}</template></el-table-column>
              </el-table>
            </div>
            <p v-if="!s.errors.length && !s.quarantine.length" class="text-xs text-gray-400">沒有錯誤，也沒有隔離的頁面。</p>
          </div>
        </el-collapse-item>
      </el-collapse>
    </template>
  </div>
</template>
