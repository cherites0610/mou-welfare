<script setup lang="ts">
const route = useRoute()
const form = reactive({ email: '', password: '' })
const loading = ref(false)
const error = ref(route.query.denied ? '這個帳號沒有後台權限（需要管理者角色，且 Email 已驗證）。' : '')

async function login() {
  loading.value = true
  error.value = ''
  const { error: e } = await useAuth().signIn.email({ email: form.email, password: form.password })
  loading.value = false
  if (e) {
    error.value = e.message || '登入失敗'
    return
  }
  useAdmin().value = null
  await navigateTo(typeof route.query.next === 'string' ? route.query.next : '/')
}

async function google() {
  await useAuth().signIn.social({ provider: 'google', callbackURL: new URL('/', window.location.origin).toString() })
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <el-card class="w-96">
      <div class="flex items-center gap-2 mb-6">
        <img src="/logo.png" alt="" class="h-8" />
        <h1 class="text-xl font-bold">哞福利後台</h1>
      </div>
      <el-alert v-if="error" :title="error" type="error" :closable="false" class="mb-4" />
      <el-form label-position="top" @submit.prevent="login">
        <el-form-item label="Email"><el-input v-model="form.email" type="email" autocomplete="username" /></el-form-item>
        <el-form-item label="密碼"><el-input v-model="form.password" type="password" show-password autocomplete="current-password" /></el-form-item>
        <el-button type="primary" native-type="submit" :loading="loading" class="w-full">登入</el-button>
      </el-form>
      <el-divider>或</el-divider>
      <el-button class="w-full" @click="google"><Icon icon="logos:google-icon" class="mr-2" />使用 Google 登入</el-button>
      <p class="text-xs text-gray-400 mt-4">和哞福利網站使用同一組帳號；管理者權限需在主機上設定。</p>
    </el-card>
  </div>
</template>
