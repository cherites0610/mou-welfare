<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../../stores/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const loading = ref(false)
const errorMsg = ref('')

const form = reactive({
  email: 'user@example.com',
  password: '12345678'
})

const handleLogin = async () => {
  if (!form.email || !form.password) {
    errorMsg.value = '請輸入帳號密碼'
    return
  }

  loading.value = true
  errorMsg.value = ''

  try {
    await userStore.userLogin(form)
    const redirect = route.query.redirect as string
    router.push(redirect || '/')
  } catch (err: any) {
    console.error(err)
    errorMsg.value = err.message || '登入失敗，請檢查帳號密碼'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <div class="title-area">
        <h1>福利小幫手</h1>
        <p>歡迎回來，請登入您的帳號</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="form-item">
          <label>Email</label>
          <input
            v-model="form.email"
            type="email"
            placeholder="請輸入 Email"
            required
          />
        </div>

        <div class="form-item">
          <label>Password</label>
          <input
            v-model="form.password"
            type="password"
            placeholder="請輸入密碼"
            required
          />
        </div>

        <div v-if="errorMsg" class="error-text">
          {{ errorMsg }}
        </div>

        <button type="submit" :disabled="loading" class="submit-btn">
          {{ loading ? '登入中...' : '登入' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: #f0f2f5;
  background-image: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: 40px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.title-area {
  text-align: center;
  margin-bottom: 30px;
}

.title-area h1 {
  margin: 0 0 10px;
  color: #303133;
  font-size: 24px;
}

.title-area p {
  margin: 0;
  color: #909399;
  font-size: 14px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-item label {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.form-item input {
  padding: 10px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s;
  outline: none;
}

.form-item input:focus {
  border-color: #409eff;
}

.error-text {
  color: #f56c6c;
  font-size: 12px;
  text-align: center;
}

.submit-btn {
  width: 100%;
  padding: 12px;
  background-color: #409eff;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.submit-btn:hover {
  background-color: #66b1ff;
}

.submit-btn:disabled {
  background-color: #a0cfff;
  cursor: not-allowed;
}
</style>
