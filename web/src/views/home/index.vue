<script setup lang="ts">
interface Feature {
  id: number
  title: string
  description: string
  icon: string
}

const features: Feature[] = [
  {
    id: 1,
    title: '智能排班',
    description: '自動化員工排班系統，大幅降低人力管理成本，提升企業營運效率。',
    icon: '📅'
  },
  {
    id: 2,
    title: '彈性福利',
    description: '多樣化的福利點數兌換，滿足不同年齡層員工的真實需求。',
    icon: '🎁'
  },
  {
    id: 3,
    title: '數據分析',
    description: '即時視覺化報表，讓管理者隨時掌握福利使用率與員工滿意度。',
    icon: '📊'
  }
]

const handleEnterSystem = () => {
  window.location.href = '/welfares'
}
</script>

<template>
  <main class="h-screen w-full overflow-y-scroll snap-y snap-mandatory scroll-smooth">
    <section class="relative h-screen w-full snap-start flex items-center justify-center bg-gray-900">
      <img src="https://placehold.co/1920x1080/png?text=Mou+Welfare+Background" alt="Background"
        class="absolute inset-0 w-full h-full object-cover opacity-40" />

      <div class="relative z-10 container mx-auto px-4 text-center">
        <h1 class="text-5xl md:text-7xl font-bold text-white mb-6 tracking-wider">
          哞福利
        </h1>
        <p class="text-xl md:text-2xl text-gray-200 mb-10 max-w-3xl mx-auto leading-relaxed">
          一站式福利查詢系統
        </p>
        <button @click="handleEnterSystem"
          class="bg-mygreen hover:bg-indigo-500 text-white text-lg font-semibold py-4 px-12 rounded-full transition-all duration-300 shadow-lg hover:shadow-indigo-500/30 transform hover:-translate-y-1">
          進入系統
        </button>
      </div>
    </section>

    <section class="h-screen w-full snap-start flex flex-col bg-slate-50">
      <div class="grow flex flex-col justify-center items-center px-4 py-10">
        <h2 class="text-3xl md:text-4xl font-bold text-slate-800 mb-12">
          三大核心亮點
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl w-full">
          <div v-for="feature in features" :key="feature.id"
            class="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-shadow duration-300 flex flex-col items-center text-center border border-slate-100">
            <div class="text-5xl mb-6">{{ feature.icon }}</div>
            <h3 class="text-xl font-bold text-slate-800 mb-4">{{ feature.title }}</h3>
            <p class="text-slate-600 leading-relaxed">
              {{ feature.description }}
            </p>
          </div>
        </div>
      </div>

      <footer class="bg-white border-t border-slate-200 py-6">
        <div
          class="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center text-sm text-slate-500">
          <div class="mb-4 md:mb-0">
            &copy; {{ new Date().getFullYear() }} 哞福利 MooWelfare. All Rights Reserved.
          </div>
          <div class="flex gap-6">
            <a href="/private" class="hover:text-indigo-600 transition-colors">隱私權政策</a>
            <a href="/terms" class="hover:text-indigo-600 transition-colors">服務條款</a>
          </div>
        </div>
      </footer>
    </section>
  </main>
</template>
