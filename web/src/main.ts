import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createApp } from 'vue'
import App from './App.vue'
import './css/main.css'
import router from './router'
import { initLiff } from './utils/liff'
(async () => {
  const app = createApp(App)

  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)

  app.use(router)
  app.use(pinia)

  if (import.meta.env.VITE_LIFF_ID) {
    await initLiff().catch(() => { })
  }

  app.mount('#app')
})()
