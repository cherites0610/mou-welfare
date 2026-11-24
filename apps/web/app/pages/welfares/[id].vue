<!-- 福利詳情：沿用 v1 web/src/views/welfare/Detail.vue。
     v2 新增：截止日與已截止標示、手機版不顯示底部導覽列（避免蓋住「前往申辦」）、相關附件、原文以 Markdown 呈現、網址加 ?review=1 顯示資料檢核。
     內容在伺服器端渲染（SEO）；登入者在瀏覽器端再取一次，附上資格分析、收藏狀態與家人比對。 -->
<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { WelfareDetail } from '~/utils/welfare'

// 詳情頁有自己的手機版標題列與底部「前往申辦」按鈕：不套用含底部導覽列的版面（v1 的底部導覽列會蓋住按鈕）
definePageMeta({ layout: false })

const route = useRoute()
const router = useRouter()
const api = useApi()
const session = useSession()

const id = computed(() => String(route.params.id))
const familyId = computed(() => (typeof route.query.familyId === 'string' ? route.query.familyId : undefined))
const review = computed(() => route.query.review === '1')
const user = computed(() => session.value.data?.user)

// 公開內容：匿名查詢（伺服器端渲染）
const { data: base, error } = await useAsyncData(`welfare-${id.value}`, () =>
  api<{ data: WelfareDetail }>(`/v1/welfare/${id.value}`, { credentials: 'omit' }).then((r) => r.data),
)
if (error.value && !base.value) {
  throw createError({ statusCode: 404, statusMessage: '找不到這個福利', fatal: true })
}

// 個人化：登入後帶 cookie 再取一次（比對結果、收藏、家人）
const personal = ref<WelfareDetail | null>(null)
const loadPersonal = async () => {
  if (!session.value.data) {
    personal.value = null
    return
  }
  try {
    personal.value = (
      await api<{ data: WelfareDetail }>(`/v1/welfare/${id.value}`, { query: { familyId: familyId.value } })
    ).data
  } catch (err) {
    // 例如已退出該家庭（403）：改用不帶家庭的結果
    if (familyId.value) {
      personal.value = (await api<{ data: WelfareDetail }>(`/v1/welfare/${id.value}`)).data
    } else {
      console.error('讀取個人化資料失敗', err)
    }
  }
}
onMounted(() => watch(() => !!session.value.data, loadPersonal, { immediate: true }))

const data = computed(() => personal.value ?? base.value)

// --- 狀態管理 ---
const isFavorite = ref(false)
watch(personal, (p) => (isFavorite.value = !!p?.isFavorite))
const loadingFavorite = ref(false)

// 頁面 title、OG meta 與 JSON-LD（伺服器端就會輸出）
// canonical 不帶查詢參數（?familyId=、?review=1 都是同一頁）；已過期的保留頁面但不讓搜尋引擎收錄
const { public: cfg } = useRuntimeConfig()
useHead(() => {
  const welfare = base.value
  if (!welfare) return { title: '福利詳情 | 哞福利' }
  const desc = welfare.summary || `${welfare.city}｜${welfare.categories.join('、')}`
  const url = `${cfg.siteUrl}/welfares/${welfare.id}`
  return {
    title: `${welfare.name} | 哞福利`,
    link: [{ rel: 'canonical', href: url }],
    meta: [
      { name: 'description', content: desc },
      { property: 'og:title', content: `${welfare.name} | 哞福利` },
      { property: 'og:description', content: desc },
      { property: 'og:url', content: url },
      { property: 'og:type', content: 'article' },
      ...(welfare.expired ? [{ name: 'robots', content: 'noindex, follow' }] : []),
    ],
    script: [
      {
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'GovernmentService',
          name: welfare.name,
          description: desc,
          areaServed: welfare.city,
          serviceType: welfare.categories.join('、'),
          url,
          ...(welfare.publishedAt && { datePublished: welfare.publishedAt }),
          ...(welfare.deadline && { expires: welfare.deadline }),
        }),
      },
    ],
  }
})

// --- 互動邏輯 ---
// 從列表點進來就返回列表（保留篩選條件）；直接開網址時回到列表首頁
const goBack = () => {
  if (import.meta.client && window.history.state?.back) router.back()
  else router.push('/welfares')
}

const goToSource = () => {
  if (data.value?.sourceUrl) {
    window.open(data.value.sourceUrl, '_blank', 'noopener')
  }
}

const toggleFavorite = async () => {
  if (!session.value.data) {
    router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  if (!data.value || loadingFavorite.value) return
  loadingFavorite.value = true
  try {
    if (isFavorite.value) {
      await api(`/v1/me/favorites/${data.value.id}`, { method: 'DELETE' })
      isFavorite.value = false
      ElMessage.success('已取消收藏')
    } else {
      await api(`/v1/me/favorites/${data.value.id}`, { method: 'PUT' })
      isFavorite.value = true
      ElMessage.success('已加入收藏')
    }
  } catch (err) {
    ElMessage.error('操作失敗')
    console.error(err)
  } finally {
    loadingFavorite.value = false
  }
}

// --- 資料處理 Helpers ---

// 1. 日期格式化（YYYY-MM-DD → 2026/11/1，與 v1 的 toLocaleDateString('zh-TW') 相同格式，但不受時區影響）
const formatDate = (d: string) => d.split('-').map(Number).join('/')
const formattedDate = computed(() => (data.value?.publishedAt ? formatDate(data.value.publishedAt) : '未知日期'))
const formattedDeadline = computed(() => (data.value?.deadline ? formatDate(data.value.deadline) : ''))

// 2. 燈號顏色與文字
const getLightInfo = (light?: string) => {
  switch (light) {
    case 'GREEN': return { color: 'text-green-500', bg: 'bg-green-100', text: '符合資格', border: 'border-green-500' }
    case 'YELLOW': return { color: 'text-yellow-500', bg: 'bg-yellow-100', text: '部分符合', border: 'border-yellow-500' }
    case 'RED': return { color: 'text-red-500', bg: 'bg-red-100', text: '資格不符', border: 'border-red-500' }
    default: return { color: 'text-gray-400', bg: 'bg-gray-100', text: '未分析', border: 'border-gray-300' }
  }
}

// 3. 家庭成員列表
const validFamilyMatches = computed(() => data.value?.familyMatches ?? [])

// 4. 本人 match
const selfMatch = computed(() => data.value?.match ?? null)
const showOriginalContent = ref(false)

// 5. 原文與附件
const contentHtml = computed(() => (data.value ? renderMarkdown(data.value.contentMd) : ''))
const fileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'mingcute:pdf-line'
  if (['doc', 'docx', 'odt'].includes(ext ?? '')) return 'mingcute:doc-line'
  if (['xls', 'xlsx', 'ods'].includes(ext ?? '')) return 'mingcute:xls-line'
  return 'mingcute:file-line'
}
</script>

<template>
  <div class="min-h-screen">
    <AppHeader class="hidden md:block" />
    <div v-if="data" class="min-h-screen pb-24 md:pb-10 font-sans">
      <div
        class="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 h-14 flex items-center justify-between md:hidden shadow-sm">
        <button @click="goBack"
          class="w-8 h-8 flex items-center justify-center -ml-1 text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
          <Icon icon="mingcute:left-line" class="text-2xl" />
        </button>
        <span class="font-bold text-lg text-gray-800 truncate max-w-50">福利詳情</span>
        <button @click="toggleFavorite"
          class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors">
          <Icon :icon="isFavorite ? 'mdi:heart' : 'mdi:heart-outline'"
            class="text-2xl transition-transform active:scale-75 duration-200"
            :class="{ 'text-red-500': isFavorite }" />
        </button>
      </div>

      <div class="hidden md:flex max-w-4xl mx-auto pt-8 px-6 items-center gap-2 text-gray-400 text-sm font-medium">
        <span class="cursor-pointer hover:text-mygreen transition-colors" @click="router.push('/welfares')">首頁</span>
        <Icon icon="mingcute:right-line" class="text-xs" />
        <span class="text-gray-800">福利詳情</span>
      </div>

      <div class="max-w-4xl mx-auto p-4 md:p-6 space-y-6">

        <div
          class="bg-white rounded-3xl p-6 md:p-8 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)] border border-gray-50 relative overflow-hidden">

          <div
            class="absolute top-0 right-0 w-64 h-64 bg-green-50 rounded-full -mr-20 -mt-20 blur-3xl opacity-50 pointer-events-none">
          </div>

          <div class="relative z-10">

            <div class="flex flex-wrap items-center gap-x-3 gap-y-2 mb-5">
              <span
                class="bg-green-50 text-mygreen px-3 py-1 rounded-full text-xs font-bold border border-green-100 flex items-center gap-1 whitespace-nowrap">
                <Icon icon="mingcute:location-line" />
                {{ data.city }}
              </span>
              <span class="text-gray-400 text-xs flex items-center gap-1 font-medium whitespace-nowrap">
                <Icon icon="mingcute:time-line" />
                {{ formattedDate }} 發布
              </span>
              <!-- v2 新增：截止日與已截止標示 -->
              <span v-if="data.expired"
                class="bg-red-50 text-red-500 px-3 py-1 rounded-full text-xs font-bold border border-red-100 flex items-center gap-1">
                <Icon icon="mingcute:time-fill" />
                已截止
              </span>
              <span v-else-if="data.deadline" class="text-orange-500 text-xs flex items-center gap-1 font-bold whitespace-nowrap">
                <Icon icon="mingcute:calendar-line" />
                {{ formattedDeadline }} 截止
              </span>
            </div>

            <h1 class="text-2xl md:text-4xl font-extrabold text-gray-800 leading-tight mb-6">
              {{ data.name }}
            </h1>

            <div class="flex flex-wrap gap-2 mb-8">
              <span v-for="cat in data.categories" :key="cat"
                class="text-gray-500 border border-gray-200 bg-white px-3 py-1.5 rounded-lg text-sm font-medium">
                # {{ cat }}
              </span>
              <span v-for="tag in data.identities" :key="tag"
                class="px-3 py-1.5 rounded-lg text-white text-sm font-bold shadow-sm flex items-center gap-1"
                :class="getTagColor(tag)">
                {{ tag }}
              </span>
            </div>

            <div class="h-px bg-gray-100 w-full mb-6"></div>

            <div class="flex flex-col sm:flex-row gap-4 justify-between items-center">

              <div class="w-full sm:w-auto flex flex-col gap-1">
                <a :href="data.sourceUrl" target="_blank"
                  class="text-sm font-bold text-mygreen hover:underline flex items-center gap-1 w-fit">
                  開啟原始公告
                  <Icon icon="mingcute:external-link-line" />
                </a>
              </div>

              <div class="hidden md:flex items-center gap-3">
                <button @click="toggleFavorite"
                  class="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center gap-2 active:scale-95 group">
                  <Icon :icon="isFavorite ? 'mdi:heart' : 'mdi:heart-outline'"
                    class="text-xl transition-colors group-hover:scale-110" :class="{ 'text-red-500': isFavorite }" />
                  {{ isFavorite ? '已收藏' : '收藏' }}
                </button>
              </div>
            </div>

          </div>
        </div>

        <div v-if="selfMatch || validFamilyMatches.length > 0" class="space-y-4">
          <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2 px-1">
            <div class="w-8 h-8 rounded-full text-blue-500 flex items-center justify-center">
              <Icon icon="mingcute:group-fill" class="text-lg" />
            </div>
            資格分析
          </h2>

          <div class="grid gap-4 sm:grid-cols-2">

            <!-- 本人分析卡 -->
            <div v-if="selfMatch"
              class="group bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden flex flex-col h-full">
              <div class="flex items-center gap-4 mb-3">
                <div class="relative shrink-0">
                  <img :src="user?.image || '/logo.png'"
                    class="w-12 h-12 rounded-full border-2 bg-white object-cover"
                    :class="getLightInfo(selfMatch.light).border" />
                  <div class="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm border border-gray-50">
                    <Icon v-if="selfMatch.light === 'GREEN'" icon="mingcute:check-circle-fill" class="text-green-500 text-lg" />
                    <Icon v-else-if="selfMatch.light === 'RED'" icon="mingcute:close-circle-fill" class="text-red-500 text-lg" />
                    <Icon v-else icon="mingcute:warning-fill" class="text-yellow-500 text-lg" />
                  </div>
                </div>
                <div>
                  <h3 class="font-bold text-gray-800 text-lg leading-tight">{{ user?.name || '我' }}</h3>
                  <span class="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                    :class="[getLightInfo(selfMatch.light).bg, getLightInfo(selfMatch.light).color]">
                    {{ getLightInfo(selfMatch.light).text }}
                  </span>
                </div>
              </div>
              <div v-if="selfMatch.reasons.length > 0 && selfMatch.light !== 'GREEN'" class="flex-1">
                <div class="bg-red-50/60 rounded-xl p-3 border border-red-100/50">
                  <ul class="space-y-1.5">
                    <li v-for="(reason, idx) in selfMatch.reasons" :key="idx"
                      class="text-xs text-gray-700 font-medium flex items-start gap-1.5">
                      <Icon icon="mingcute:close-line" class="text-red-500 shrink-0 mt-0.5" />
                      <span>{{ reason }}</span>
                    </li>
                  </ul>
                </div>
              </div>
              <div class="absolute bottom-0 left-0 right-0 h-1 opacity-50"
                :class="getLightInfo(selfMatch.light).bg"></div>
            </div>

            <!-- 家庭成員卡 -->
            <div v-for="member in validFamilyMatches" :key="member.userId"
              class="group bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden flex flex-col h-full">
              <div class="flex items-center gap-4 mb-3">
                <div class="relative shrink-0">
                  <img :src="member.image || '/logo.png'"
                    class="w-12 h-12 rounded-full border-2 bg-white object-cover"
                    :class="getLightInfo(member.match?.light).border" />
                  <div class="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm border border-gray-50">
                    <Icon v-if="member.match?.light === 'GREEN'" icon="mingcute:check-circle-fill"
                      class="text-green-500 text-lg" />
                    <Icon v-else-if="member.match?.light === 'RED'" icon="mingcute:close-circle-fill"
                      class="text-red-500 text-lg" />
                    <Icon v-else icon="mingcute:warning-fill" class="text-yellow-500 text-lg" />
                  </div>
                </div>
                <div>
                  <h3 class="font-bold text-gray-800 text-lg leading-tight">{{ member.name || '家庭成員' }}</h3>
                  <span class="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                    :class="[getLightInfo(member.match?.light).bg, getLightInfo(member.match?.light).color]">
                    {{ getLightInfo(member.match?.light).text }}
                  </span>
                </div>
              </div>

              <div v-if="member.match.reasons.length > 0 && member.match.light !== 'GREEN'" class="flex-1">
                <div class="bg-red-50/60 rounded-xl p-3 border border-red-100/50">
                  <ul class="space-y-1.5">
                    <li v-for="(reason, idx) in member.match.reasons" :key="idx"
                      class="text-xs text-gray-700 font-medium flex items-start gap-1.5">
                      <Icon icon="mingcute:close-line" class="text-red-500 shrink-0 mt-0.5" />
                      <span>{{ reason }}</span>
                    </li>
                  </ul>
                </div>
              </div>
              <div class="absolute bottom-0 left-0 right-0 h-1 opacity-50"
                :class="getLightInfo(member.match?.light).bg"></div>
            </div>
          </div>
        </div>

        <div v-if="data.summary"
          class="bg-linear-to-br from-[#F0FDF4] to-white border border-green-100/50 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden group">
          <Icon icon="mingcute:ai-fill"
            class="absolute -right-6 -top-6 text-[10rem] text-green-500/5 rotate-12 transition-transform duration-700 group-hover:rotate-6 pointer-events-none" />
          <h2 class="text-lg font-bold text-mygreen mb-4 flex items-center gap-2 relative z-10">
            <Icon icon="mingcute:ai-line" class="text-xl" />
            AI 智慧重點摘要
          </h2>
          <div class="relative z-10 bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-green-50">
            <p class="text-gray-700 leading-relaxed text-justify tracking-wide font-medium">
              {{ data.summary }}
            </p>
          </div>
        </div>

        <div
          class="bg-white rounded-3xl p-6 md:p-8 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)] border border-gray-50 space-y-8">

          <div v-if="data.requirements && data.requirements.length">
            <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-3">
              <span class="flex items-center justify-center w-8 h-8 rounded-lg  text-mygreen">
                <Icon icon="mingcute:list-check-line" />
              </span>
              申請條件
            </h3>
            <ul class="space-y-3 pl-2">
              <li v-for="(req, i) in data.requirements" :key="i" class="flex items-start gap-3 group">
                <div
                  class="mt-1 w-5 h-5 rounded-full border border-green-200 text-green-500 flex items-center justify-center bg-green-50 shrink-0 group-hover:bg-mygreen group-hover:text-white transition-colors">
                  <Icon icon="mingcute:check-line" class="text-xs" />
                </div>
                <span class="text-gray-600 group-hover:text-gray-900 transition-colors">{{ req }}</span>
              </li>
            </ul>
          </div>

          <div v-if="data.rewards && data.rewards.length">
            <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-3">
              <span class="flex items-center justify-center w-8 h-8 rounded-lg text-orange-500">
                <Icon icon="mingcute:gift-2-line" />
              </span>
              補助內容
            </h3>
            <div class="grid gap-3">
              <div v-for="(rew, i) in data.rewards" :key="i"
                class="flex items-center gap-3 p-3 bg-orange-50/50 rounded-xl border border-orange-100/50 text-gray-700">
                <Icon icon="mingcute:star-fill" class="text-orange-400 shrink-0" />
                <span class="font-medium">{{ rew }}</span>
              </div>
            </div>
          </div>

          <!-- v2 新增：附件 -->
          <div v-if="data.attachments.length">
            <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-3">
              <span class="flex items-center justify-center w-8 h-8 rounded-lg text-myblue">
                <Icon icon="mingcute:attachment-2-line" />
              </span>
              相關附件
            </h3>
            <div class="grid gap-3">
              <a v-for="a in data.attachments" :key="a.url" :href="a.url" target="_blank" rel="noopener noreferrer"
                class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 text-gray-700 hover:border-myblue hover:text-myblue transition-colors">
                <Icon :icon="fileIcon(a.name)" class="text-xl text-gray-400 shrink-0" />
                <span class="font-medium break-all flex-1">{{ a.name }}</span>
                <Icon icon="mingcute:download-2-line" class="text-gray-400 shrink-0" />
              </a>
            </div>
          </div>

          <div class="h-px bg-gray-100 w-full"></div>

          <div class="border border-gray-100 rounded-2xl overflow-hidden">
            <button @click="showOriginalContent = !showOriginalContent"
              class="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors duration-200">
              <h3 class="font-bold text-gray-800 text-sm flex items-center gap-2">
                <Icon icon="mingcute:file-text-line" class="text-gray-400 text-lg" />
                原始公告內容
              </h3>

              <Icon icon="mingcute:down-line" class="text-gray-400 text-lg transition-transform duration-300"
                :class="{ 'rotate-180': showOriginalContent }" />
            </button>

            <div v-show="showOriginalContent" class="bg-white border-t border-gray-100">
              <!-- 原文是爬蟲轉出的 Markdown；renderMarkdown 已關閉原始 HTML，可以安全地用 v-html -->
              <div class="welfare-content text-gray-600 text-sm leading-loose p-6" v-html="contentHtml" />
            </div>
          </div>
        </div>

      </div>

      <div
        class="fixed bottom-0 left-0 w-full bg-white border-t border-gray-100 p-4 flex gap-3 md:hidden z-40 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        <button @click="goToSource"
          class="flex-1 bg-mygreen text-white font-bold py-3.5 rounded-xl shadow-lg shadow-green-200 active:scale-95 transition-transform flex items-center justify-center gap-2">
          前往申辦
          <Icon icon="mingcute:external-link-line" />
        </button>
      </div>

    </div>

    <!-- 資料檢核（爬蟲資料用）：網址加上 ?review=1 才顯示 -->
    <div v-if="data && review" class="max-w-4xl mx-auto px-4 md:px-6 pb-28 md:pb-10">
      <details class="bg-gray-50 rounded-xl border border-dashed border-mygray-200 p-4 text-xs text-gray-600">
        <summary class="cursor-pointer font-bold">資料檢核（原始欄位）</summary>
        <dl class="mt-3 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 break-all">
          <dt class="text-mygray-300">ID</dt><dd class="font-mono">{{ data.id }}</dd>
          <dt class="text-mygray-300">來源網址</dt>
          <dd><a :href="data.sourceUrl" target="_blank" rel="noopener noreferrer" class="text-myblue hover:underline">{{ data.sourceUrl }}</a></dd>
          <dt class="text-mygray-300">發布 / 截止</dt><dd>{{ data.publishedAt ?? '—' }} / {{ data.deadline ?? '—' }}</dd>
          <dt class="text-mygray-300">類別</dt><dd>{{ data.categories.join('、') || '（無）' }}</dd>
          <dt class="text-mygray-300">身分限制</dt><dd>{{ data.identities.join('、') || '（無）' }}</dd>
          <dt class="text-mygray-300">正文字數</dt><dd>{{ data.contentMd.length.toLocaleString() }}</dd>
          <dt class="text-mygray-300">資格 / 補助</dt><dd>{{ data.requirements.length }} / {{ data.rewards.length }} 項（規則結構化時為 0）</dd>
        </dl>
        <details class="mt-3">
          <summary class="cursor-pointer">原始 Markdown</summary>
          <pre class="mt-2 whitespace-pre-wrap bg-white border border-mygray-100 rounded p-3 max-h-96 overflow-auto">{{ data.contentMd }}</pre>
        </details>
      </details>
    </div>

    <div v-if="!data" class="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
      <Icon icon="line-md:loading-loop" class="text-5xl text-mygreen/50" />
      <p class="text-gray-400 text-sm font-medium animate-pulse">正在讀取福利資料...</p>
    </div>
  </div>

</template>

<style scoped>
/* 正文是爬蟲轉出的 Markdown：只給基本排版，表格可以橫向捲動 */
.welfare-content :deep(h1),
.welfare-content :deep(h2),
.welfare-content :deep(h3) { font-weight: 700; margin: 1em 0 0.5em; color: #1f2937; }
.welfare-content :deep(p) { margin: 0.5em 0; }
.welfare-content :deep(ul) { list-style: disc; padding-left: 1.25rem; margin: 0.5em 0; }
.welfare-content :deep(ol) { list-style: decimal; padding-left: 1.25rem; margin: 0.5em 0; }
.welfare-content :deep(li) { margin: 0.2em 0; }
.welfare-content :deep(a) { color: #3a90e0; word-break: break-all; }
.welfare-content :deep(table) { display: block; overflow-x: auto; border-collapse: collapse; margin: 0.75em 0; line-height: 1.6; }
.welfare-content :deep(th),
.welfare-content :deep(td) { border: 1px solid #e5e7eb; padding: 4px 8px; vertical-align: top; min-width: 6rem; }
.welfare-content :deep(th) { background: #f9fafb; }
</style>
