<!-- 阿哞聊天頁：手機底部導航的「阿哞」（填滿導航以上的畫面）；桌機在福利列表右下開浮動視窗，直接開這頁也能用 -->
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useHead({ title: 'AI 助理 | 哞福利' })
</script>

<template>
  <div
    class="fixed inset-x-0 top-0 bottom-[calc(3.8rem+env(safe-area-inset-bottom))] md:static md:h-[calc(100vh-10rem)] md:max-w-3xl md:mx-auto md:rounded-2xl md:border md:border-gray-100 md:overflow-hidden">
    <ChatBoard is-mobile />
  </div>
</template>
