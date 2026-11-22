<!-- 福利詳情（粗糙版：先用來檢核爬蟲資料）。下方「資料檢核」區塊列出原始欄位，方便比對原始網頁。 -->
<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const api = useApi()
const id = computed(() => String(route.params.id))

const { data: w, error } = await useAsyncData(`welfare-${id.value}`, () => api<{ data: WelfareDetail }>(`/v1/welfare/${id.value}`).then((r) => r.data))

if (error.value && !w.value) {
  throw createError({ statusCode: 404, statusMessage: '找不到這個福利', fatal: true })
}

useHead(() => ({ title: w.value ? `${w.value.name}（${w.value.city}）| 哞福利` : '福利詳情 | 哞福利' }))

const contentHtml = computed(() => (w.value ? renderMarkdown(w.value.contentMd) : ''))
const sourceHost = computed(() => {
  try {
    return w.value ? new URL(w.value.sourceUrl).host : ''
  } catch {
    return ''
  }
})

// 從列表點進來就返回列表（保留篩選條件與頁碼）；直接開網址時回到列表首頁
function back() {
  if (import.meta.client && window.history.state?.back) router.back()
  else router.push('/welfares')
}
</script>

<template>
  <div v-if="w" class="px-4 py-4 md:px-0 md:py-0 flex flex-col gap-4 max-w-3xl mx-auto">
    <button class="self-start text-sm text-mygray-300 hover:text-mygreen-300" @click="back">← 返回列表</button>

    <!-- 標題 -->
    <section class="bg-white rounded-xl border border-mygray-100 p-5">
      <div class="flex items-start justify-between gap-3 mb-2">
        <h1 class="text-xl font-bold text-gray-800 leading-snug">{{ w.name }}</h1>
        <span class="shrink-0 text-sm text-mygray-300 mt-1">{{ w.city }}</span>
      </div>
      <div class="flex flex-wrap gap-1.5 text-xs mb-3">
        <span v-for="c in w.categories" :key="c" class="px-2 py-0.5 rounded-full"
          :class="CATEGORY_COLOR[c] ?? 'bg-mygray-100 text-mygray-300'">{{ c }}</span>
        <span v-for="i in w.identities" :key="i" class="px-2 py-0.5 rounded-full border border-mygray-200 text-gray-500">
          {{ i }}
        </span>
        <span v-if="w.expired" class="px-2 py-0.5 rounded-full bg-myred text-white">已截止</span>
      </div>
      <p class="text-gray-700">{{ w.summary }}</p>
      <div class="mt-3 text-sm text-mygray-300 flex flex-wrap gap-x-4 gap-y-1">
        <span>發布日期：{{ w.publishedAt ?? '—' }}</span>
        <span>截止日期：{{ w.deadline ?? '—' }}</span>
      </div>
      <a :href="w.sourceUrl" target="_blank" rel="noopener noreferrer"
        class="inline-block mt-4 px-4 py-2 rounded-lg bg-mygreen text-white text-sm font-bold hover:bg-mygreen-200">
        查看原始公告（{{ sourceHost }}）↗
      </a>
    </section>

    <!-- 結構化結果 -->
    <section v-if="w.requirements.length || w.rewards.length" class="bg-white rounded-xl border border-mygray-100 p-5 grid gap-4 md:grid-cols-2">
      <div v-if="w.requirements.length">
        <h2 class="font-bold text-gray-800 mb-2">申請資格</h2>
        <ul class="list-disc pl-5 text-sm text-gray-700 space-y-1">
          <li v-for="r in w.requirements" :key="r">{{ r }}</li>
        </ul>
      </div>
      <div v-if="w.rewards.length">
        <h2 class="font-bold text-gray-800 mb-2">補助內容</h2>
        <ul class="list-disc pl-5 text-sm text-gray-700 space-y-1">
          <li v-for="r in w.rewards" :key="r">{{ r }}</li>
        </ul>
      </div>
    </section>

    <!-- 附件 -->
    <section v-if="w.attachments.length" class="bg-white rounded-xl border border-mygray-100 p-5">
      <h2 class="font-bold text-gray-800 mb-2">附件（{{ w.attachments.length }}）</h2>
      <ul class="text-sm space-y-1">
        <li v-for="a in w.attachments" :key="a.url">
          <a :href="a.url" target="_blank" rel="noopener noreferrer" class="text-myblue hover:underline break-all">{{ a.name }}</a>
        </li>
      </ul>
    </section>

    <!-- 正文 -->
    <section class="bg-white rounded-xl border border-mygray-100 p-5">
      <h2 class="font-bold text-gray-800 mb-3">原文內容</h2>
      <!-- renderMarkdown 已關閉原始 HTML，可以安全地用 v-html -->
      <div class="welfare-content text-sm text-gray-700" v-html="contentHtml" />
    </section>

    <!-- 資料檢核 -->
    <details class="bg-gray-50 rounded-xl border border-dashed border-mygray-200 p-4 text-xs text-gray-600">
      <summary class="cursor-pointer font-bold">資料檢核（原始欄位）</summary>
      <dl class="mt-3 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 break-all">
        <dt class="text-mygray-300">ID</dt><dd class="font-mono">{{ w.id }}</dd>
        <dt class="text-mygray-300">來源網址</dt>
        <dd><a :href="w.sourceUrl" target="_blank" rel="noopener noreferrer" class="text-myblue hover:underline">{{ w.sourceUrl }}</a></dd>
        <dt class="text-mygray-300">類別</dt><dd>{{ w.categories.join('、') || '（無）' }}</dd>
        <dt class="text-mygray-300">身分限制</dt><dd>{{ w.identities.join('、') || '（無）' }}</dd>
        <dt class="text-mygray-300">正文字數</dt><dd>{{ w.contentMd.length.toLocaleString() }}</dd>
        <dt class="text-mygray-300">資格 / 補助</dt><dd>{{ w.requirements.length }} / {{ w.rewards.length }} 項（規則結構化時為 0）</dd>
      </dl>
      <details class="mt-3">
        <summary class="cursor-pointer">原始 Markdown</summary>
        <pre class="mt-2 whitespace-pre-wrap bg-white border border-mygray-100 rounded p-3 max-h-96 overflow-auto">{{ w.contentMd }}</pre>
      </details>
    </details>
  </div>
</template>

<style scoped>
/* 正文是爬蟲轉出的 Markdown：只給基本排版，表格可以橫向捲動 */
.welfare-content :deep(h1),
.welfare-content :deep(h2),
.welfare-content :deep(h3) { font-weight: 700; margin: 1em 0 0.5em; color: #1f2937; }
.welfare-content :deep(p) { margin: 0.5em 0; line-height: 1.75; }
.welfare-content :deep(ul) { list-style: disc; padding-left: 1.25rem; margin: 0.5em 0; }
.welfare-content :deep(ol) { list-style: decimal; padding-left: 1.25rem; margin: 0.5em 0; }
.welfare-content :deep(li) { margin: 0.2em 0; }
.welfare-content :deep(a) { color: #3a90e0; word-break: break-all; }
.welfare-content :deep(table) { display: block; overflow-x: auto; border-collapse: collapse; margin: 0.75em 0; }
.welfare-content :deep(th),
.welfare-content :deep(td) { border: 1px solid #e5e7eb; padding: 4px 8px; vertical-align: top; min-width: 6rem; }
.welfare-content :deep(th) { background: #f9fafb; }
</style>
