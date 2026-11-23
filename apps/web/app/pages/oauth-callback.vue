<!-- 第三方登入完成後的落地頁（Better Auth 已在 API 網域設好 session cookie）：沒填過個人資料就去填，否則回原頁面 -->
<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: '登入中 | 哞福利', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const route = useRoute()
const router = useRouter()
const { refresh } = useMe()

onMounted(async () => {
  try {
    const me = await refresh()
    router.replace(needsProfile(me) ? '/register/profile' : safeRedirect(route.query.redirect))
  } catch {
    router.replace({ path: '/login', query: { error: 'unable_to_get_user_info' } })
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center text-gray-400 text-sm">登入中…</div>
</template>
