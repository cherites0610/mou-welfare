<script setup lang="ts">
// 骨架頁：伺服器端渲染時呼叫 API，確認 SSR → API 的路徑可用（P0 驗證項目）
const { public: cfg } = useRuntimeConfig()
const { data, error } = await useFetch<{ data: { id: string; question: string; answer: string }[] }>(
  `${cfg.apiBase}/v1/faq`,
)
</script>

<template>
  <main>
    <h1>哞福利</h1>
    <p v-if="error">API 暫時無法連線</p>
    <ul v-else>
      <li v-for="f in data?.data ?? []" :key="f.id">{{ f.question }}</li>
    </ul>
  </main>
</template>
