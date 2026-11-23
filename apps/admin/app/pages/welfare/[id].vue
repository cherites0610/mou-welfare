<script setup lang="ts">
const api = useApi()
const route = useRoute()
const { public: cfg } = useRuntimeConfig()
const id = computed(() => route.params.id as string)

const { data, error, refresh } = await useAsyncData(`welfare-${id.value}`, () =>
  api<{ data: WelfareDetail }>(`/v1/admin/welfare/${id.value}`).then((r) => r.data),
  { watch: [id] },
)
const note = ref('')
watch(data, (d) => (note.value = d?.reviewNote ?? ''), { immediate: true })
const saving = ref(false)

// 上一筆／下一筆：列表頁目前那一頁的順序（快速檢核用）
const ids = ref<string[]>([])
onMounted(() => (ids.value = JSON.parse(sessionStorage.getItem('admin:welfare-ids') ?? '[]')))
const idx = computed(() => ids.value.indexOf(id.value))
const go = (d: number) => {
  const next = ids.value[idx.value + d]
  if (next) navigateTo({ path: `/welfare/${next}`, query: route.query })
}
const back = computed(() => (typeof route.query.back === 'string' ? route.query.back : '/welfare'))

async function save(patch: Record<string, unknown>, msg: string, thenNext = false) {
  saving.value = true
  try {
    const r = await api<{ data: WelfareDetail }>(`/v1/admin/welfare/${id.value}`, { method: 'PATCH', body: patch })
    data.value = r.data
    ElMessage.success(msg)
    if (thenNext && idx.value >= 0 && idx.value < ids.value.length - 1) go(1)
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    saving.value = false
  }
}
const withNote = (p: Record<string, unknown>) => (note.value !== (data.value?.reviewNote ?? '') ? { ...p, note: note.value || null } : p)

async function restructure() {
  await ElMessageBox.confirm('重新用 LLM 結構化這一筆（約 0.0024 美元）？人工判定的狀態會保留。', '重新結構化', { type: 'warning' })
  try {
    await api(`/v1/admin/welfare/${id.value}/restructure`, { method: 'POST' })
    ElMessage.success('已排入佇列，通常幾秒內完成')
    setTimeout(() => refresh(), 5000)
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

const html = computed(() => renderMarkdown(data.value?.contentMd ?? ''))
const sourceFields = computed(() => Object.entries(data.value?.sourceFields ?? {}).filter(([, v]) => v !== '' && v !== null))
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2">
      <el-button @click="navigateTo(back)">← 返回列表</el-button>
      <template v-if="idx >= 0">
        <el-button :disabled="idx <= 0" @click="go(-1)">上一筆</el-button>
        <el-button :disabled="idx >= ids.length - 1" @click="go(1)">下一筆</el-button>
        <span class="text-xs text-gray-400">本頁第 {{ idx + 1 }} / {{ ids.length }} 筆</span>
      </template>
    </div>
    <el-alert v-if="error" :title="error.message" type="error" :closable="false" />

    <template v-if="data">
      <el-card shadow="never">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <el-tag :type="STATUS_TYPE[data.status]">{{ STATUS_LABEL[data.status] }}</el-tag>
              <el-tag v-if="data.statusOverride" type="warning">人工判定：{{ STATUS_LABEL[data.statusOverride] }}</el-tag>
              <el-tag v-if="data.pinnedAt">置頂</el-tag>
              <h1 class="text-lg font-bold">{{ data.name }}</h1>
            </div>
            <div class="text-xs text-gray-500 mt-2 space-x-3">
              <span>{{ data.city }}</span>
              <span><code>{{ data.programKey }}</code></span>
              <a :href="data.sourceUrl" target="_blank" rel="noopener" class="text-blue-500">原始網頁 ↗</a>
              <a v-if="data.status === 'active' || data.status === 'expired'" :href="`${cfg.webBase}/welfares/${data.id}`" target="_blank" rel="noopener" class="text-blue-500">前台頁面 ↗</a>
            </div>
            <div v-if="data.reviewedAt" class="text-xs text-gray-400 mt-1">最後檢核：{{ fmtTime(data.reviewedAt) }}</div>
          </div>
          <div class="flex flex-col gap-2 items-end">
            <div class="flex gap-2">
              <el-button type="success" :loading="saving" :disabled="data.statusOverride === 'active'" @click="save(withNote({ statusOverride: 'active' }), '已判為福利', true)">判為福利</el-button>
              <el-button type="danger" :loading="saving" :disabled="data.statusOverride === 'rejected'" @click="save(withNote({ statusOverride: 'rejected' }), '已判為非福利', true)">判為非福利</el-button>
              <el-button v-if="data.statusOverride" :loading="saving" @click="save({ statusOverride: null }, '已取消人工判定，將重新結構化')">取消人工判定</el-button>
            </div>
            <div class="flex gap-2">
              <el-button size="small" :loading="saving" @click="save({ pinned: !data.pinnedAt }, data.pinnedAt ? '已取消置頂' : '已置頂')">{{ data.pinnedAt ? '取消置頂' : '置頂' }}</el-button>
              <el-button size="small" @click="restructure">重新結構化</el-button>
            </div>
            <div class="flex gap-2 w-96">
              <el-input v-model="note" size="small" placeholder="檢核備註（判定時一併儲存）" maxlength="500" />
              <el-button size="small" :loading="saving" :disabled="note === (data.reviewNote ?? '')" @click="save({ note: note || null }, '已儲存備註')">存備註</el-button>
            </div>
            <div class="text-xs text-gray-400">判定後自動跳到下一筆</div>
          </div>
        </div>
        <el-alert v-if="data.structureError" type="error" :closable="false" class="mt-3" :title="`結構化錯誤：${data.structureError}`" />
      </el-card>

      <div class="grid xl:grid-cols-2 gap-4">
        <el-card shadow="never" header="結構化結果">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="摘要">{{ data.summary || '—' }}</el-descriptions-item>
            <el-descriptions-item label="類別">{{ data.categories.join('、') || '—' }}</el-descriptions-item>
            <el-descriptions-item label="必備身分">{{ data.identities.join('、') || '（無）' }}</el-descriptions-item>
            <el-descriptions-item label="申請資格">
              <ul class="list-disc pl-4"><li v-for="r in data.requirements" :key="r">{{ r }}</li></ul>
              <span v-if="!data.requirements.length">—</span>
            </el-descriptions-item>
            <el-descriptions-item label="補助內容">
              <ul class="list-disc pl-4"><li v-for="r in data.rewards" :key="r">{{ r }}</li></ul>
              <span v-if="!data.rewards.length">—</span>
            </el-descriptions-item>
            <el-descriptions-item label="截止日">{{ data.deadline ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="結構化">
              {{ data.structuredBy === 'llm' ? 'LLM' : data.structuredBy === 'rules' ? '規則' : '—' }}
              {{ data.structuredModel ?? '' }} <code v-if="data.structuredPromptVersion">{{ data.structuredPromptVersion }}</code>
              · {{ fmtTime(data.structuredAt) }} · embedding {{ data.hasEmbedding ? '有' : '無' }}
            </el-descriptions-item>
            <el-descriptions-item label="發布日">{{ data.publishedAt ?? '—' }}</el-descriptions-item>
          </el-descriptions>
          <template v-if="sourceFields.length">
            <h3 class="font-bold mt-4 mb-2 text-sm">開放資料原始欄位</h3>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item v-for="[k, v] in sourceFields" :key="k" :label="k">{{ v }}</el-descriptions-item>
            </el-descriptions>
          </template>
        </el-card>

        <el-card shadow="never" header="原文">
          <div class="prose-md text-sm max-h-[70vh] overflow-y-auto" v-html="html" />
          <el-collapse v-if="data.attachments.length" class="mt-4">
            <el-collapse-item v-for="a in data.attachments" :key="a.url" :name="a.url">
              <template #title>
                📎 {{ a.name }} <span class="text-xs text-gray-400 ml-2">{{ a.text.length }} 字</span>
              </template>
              <a :href="a.url" target="_blank" rel="noopener" class="text-xs text-blue-500">下載 ↗</a>
              <pre class="whitespace-pre-wrap text-xs mt-2 max-h-96 overflow-y-auto">{{ a.text || '（沒有抽出文字）' }}</pre>
            </el-collapse-item>
          </el-collapse>
        </el-card>
      </div>

      <el-card shadow="never" header="LLM 呼叫">
        <el-table :data="data.llmCalls" size="small" empty-text="沒有紀錄">
          <el-table-column label="時間" width="140"><template #default="{ row }">{{ fmtTime(row.at) }}</template></el-table-column>
          <el-table-column label="用途" width="100"><template #default="{ row }">{{ PURPOSE_LABEL[row.purpose] ?? row.purpose }}</template></el-table-column>
          <el-table-column prop="model" label="模型" min-width="180" />
          <el-table-column label="prompt" width="120"><template #default="{ row }"><code>{{ row.promptVersion ?? '' }}</code></template></el-table-column>
          <el-table-column label="輸入／輸出" align="right"><template #default="{ row }">{{ fmtNum(row.inputTokens) }} / {{ fmtNum(row.outputTokens) }}</template></el-table-column>
          <el-table-column label="毫秒" prop="latencyMs" align="right" width="80" />
          <el-table-column label="結果" width="90"><template #default="{ row }">{{ row.ok ? 'ok' : row.errorKind }}</template></el-table-column>
          <el-table-column label="費用" align="right" width="100"><template #default="{ row }">{{ fmtUsd(row.costUsd) }}</template></el-table-column>
        </el-table>
      </el-card>

      <el-card shadow="never" header="修改紀錄">
        <el-table :data="data.history" size="small" empty-text="沒有紀錄">
          <el-table-column label="時間" width="140"><template #default="{ row }">{{ fmtTime(row.at) }}</template></el-table-column>
          <el-table-column prop="adminEmail" label="管理者" width="220" />
          <el-table-column label="動作" width="110"><template #default="{ row }">{{ ACTION_LABEL[row.action] ?? row.action }}</template></el-table-column>
          <el-table-column label="內容"><template #default="{ row }"><code class="text-xs">{{ JSON.stringify(row.detail) }}</code></template></el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>
