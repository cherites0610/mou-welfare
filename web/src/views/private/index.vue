<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'

// 假設您有全域註冊 AppHeader，若無請解開下方註解引入
// import AppHeader from '@/components/AppHeader.vue'

const router = useRouter()

const goBack = () => {
  router.back()
}
</script>

<template>
  <div class="min-h-screen bg-white md:bg-gray-50 font-sans text-gray-700">
    
    <div
      class="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 h-14 flex items-center justify-between md:hidden"
    >
      <button
        @click="goBack"
        class="w-8 h-8 flex items-center justify-center -ml-2 text-gray-600 hover:bg-gray-50 rounded-full transition-colors active:scale-95"
      >
        <Icon icon="mingcute:left-line" class="text-2xl" />
      </button>

      <span class="font-bold text-lg text-gray-900">服務條款</span>

      <div class="w-8"></div>
    </div>

    <AppHeader class="hidden md:block mb-6" />

    <div class="flex flex-col h-[calc(100dvh-3.5rem)] md:h-[calc(100vh-8rem)] overflow-hidden">
      
      <div class="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 md:py-0 scroll-smooth">
        <div class="max-w-7xl px-6 mx-auto md:bg-white md:p-12 md:rounded-3xl md:shadow-sm md:border md:border-gray-100 mb-10 pb-20 md:pb-10 md:my-10">
          
          <div class="px-5 py-8 md:text-center md:border-b md:border-gray-100 md:mb-8">
            <h1 class="text-2xl md:text-3xl font-extrabold text-gray-900 mb-2 leading-tight">
              應用程式<br class="md:hidden" />服務條款
            </h1>
            <p class="text-sm text-gray-400 font-medium mt-2 flex items-center gap-1 md:justify-center">
               <Icon icon="mingcute:time-line" />
               生效日期： 2026 年 1 月 1 日
            </p>
          </div>

          <div class="px-5 md:px-0 space-y-10 text-[15px] md:text-base leading-relaxed text-justify">
            
            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-3">
                <span class="bg-gray-900 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shadow-gray-200">1</span>
                同意條款
              </h2>
              <p class="text-gray-600">
                歡迎您使用 <span class="font-bold text-gray-800">mou-welfare.com</span>（以下簡稱「本服務」或「本網站」），本服務由 <span class="font-bold text-gray-800">哞福利</span>（以下簡稱「我們」）營運。當您開始使用本服務（包括瀏覽網站、註冊帳號或使用福利媒合功能），即表示您已閱讀、瞭解並同意接受本服務條款之所有內容。若您不同意本條款的任何部分，請立即停止使用本服務。
              </p>
            </section>

            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-3">
                <span class="bg-gray-900 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shadow-gray-200">2</span>
                服務內容與性質
              </h2>
              <p class="mb-3 text-gray-600">本服務主要提供「智慧福利媒合」功能，透過使用者輸入的資料與福利法規資料庫進行比對，提供福利補助的資訊索引與推薦。 請注意：</p>
              
              <div class="space-y-3">
                <div class="bg-gray-50 p-4 rounded-xl border border-gray-100 flex gap-3">
                   <Icon icon="mingcute:information-line" class="text-gray-400 text-xl shrink-0 mt-0.5" />
                   <p class="text-sm text-gray-600">本服務僅為<span class="font-bold text-gray-800">資訊媒合工具</span>，並非政府機關或社福機構之官方代表。</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-xl border border-gray-100 flex gap-3">
                   <Icon icon="mingcute:warning-line" class="text-gray-400 text-xl shrink-0 mt-0.5" />
                   <p class="text-sm text-gray-600">本服務所提供的媒合結果<span class="font-bold text-gray-800">僅供參考</span>，不代表您必然獲得該項福利或補助的核准。</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-xl border border-gray-100 flex gap-3">
                   <Icon icon="mingcute:government-line" class="text-gray-400 text-xl shrink-0 mt-0.5" />
                   <p class="text-sm text-gray-600">所有福利申請的最終審核權與決定權，均屬於該福利項目的主管機關或發放單位。</p>
                </div>
              </div>
            </section>

            <section class="bg-blue-50/50 -mx-5 px-5 py-6 md:mx-0 md:rounded-2xl md:px-6">
              <h2 class="text-lg font-bold text-blue-900 mb-4 flex items-center gap-3">
                <span class="bg-blue-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shadow-blue-200">3</span>
                AI 技術應用與風險聲明
              </h2>
              <p class="mb-4 text-blue-800/80 text-sm">本服務部分功能採用了先進的 人工智慧（AI）技術進行資料分析與內容生成。針對 AI 技術之特性，您理解並同意以下事項：</p>
              <ul class="space-y-3">
                <li class="flex gap-3 text-sm text-blue-900">
                  <span class="w-1.5 h-1.5 bg-blue-400 rounded-full mt-2 shrink-0"></span>
                  <span><strong class="text-blue-700">AI 幻覺與誤差：</strong> 生成式 AI 模型在運算過程中，可能會產生看似合理但實際上不準確、過時或完全虛構的資訊。</span>
                </li>
                <li class="flex gap-3 text-sm text-blue-900">
                  <span class="w-1.5 h-1.5 bg-blue-400 rounded-full mt-2 shrink-0"></span>
                  <span><strong class="text-blue-700">非專業建議：</strong> AI 生成之內容僅供參考輔助，不應被視為最終的法律、醫療或專業財務建議。</span>
                </li>
                <li class="flex gap-3 text-sm text-blue-900">
                  <span class="w-1.5 h-1.5 bg-blue-400 rounded-full mt-2 shrink-0"></span>
                  <span><strong class="text-blue-700">查證義務：</strong> 在您依據本服務提供的 AI 媒合結果採取任何行動前，您有義務自行向相關政府機關或官方網站查證資訊的正確性。</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-3">
                <span class="bg-gray-900 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shadow-gray-200">4</span>
                帳號註冊與安全
              </h2>
              <p class="mb-3 text-gray-600">為了使用特定功能，您需透過 Google 或 LINE 帳號進行登入驗證。</p>
              <ul class="space-y-4 pl-2 border-l-2 border-gray-100 ml-3">
                <li class="pl-4 relative">
                  <span class="absolute -left-[21px] top-1.5 w-3 h-3 bg-gray-200 rounded-full border-2 border-white"></span>
                  <h3 class="font-bold text-gray-800 text-sm mb-1">資料正確性</h3>
                  <p class="text-sm text-gray-500">您同意提供正確、最新且完整的個人資料。</p>
                </li>
                <li class="pl-4 relative">
                  <span class="absolute -left-[21px] top-1.5 w-3 h-3 bg-gray-200 rounded-full border-2 border-white"></span>
                  <h3 class="font-bold text-gray-800 text-sm mb-1">帳號安全</h3>
                  <p class="text-sm text-gray-500">您有責任維護您第三方帳號的安全性。若因您的設備遺失或帳號遭盜用而導致資料外洩，本服務不負賠償責任。</p>
                </li>
                <li class="pl-4 relative">
                  <span class="absolute -left-[21px] top-1.5 w-3 h-3 bg-gray-200 rounded-full border-2 border-white"></span>
                  <h3 class="font-bold text-gray-800 text-sm mb-1">禁止共用</h3>
                  <p class="text-sm text-gray-500">除非屬於家庭帳號管理功能，否則請勿將您的帳號轉讓或出借予他人使用。</p>
                </li>
              </ul>
            </section>

            <section class="bg-orange-50/50 -mx-5 px-5 py-6 md:mx-0 md:rounded-2xl md:px-6 border-l-4 border-orange-400">
              <h2 class="text-lg font-bold text-orange-900 mb-4 flex items-center gap-3">
                <Icon icon="mingcute:alert-line" class="text-2xl" />
                使用者資料與免責聲明
              </h2>
              <p class="mb-3 text-sm text-orange-900/80">基於本服務之運作特性，我們對使用者資料及媒合結果做以下特別聲明：</p>
              <div class="space-y-4 text-sm text-orange-900/80">
                <p><strong class="text-orange-800">自主申報原則：</strong> 本服務之運算基礎完全依賴您所輸入的資料。我們不會，亦無權限與義務查核您提供資料的真實性。</p>
                <p><strong class="text-orange-800">資料責任：</strong> 若您故意輸入虛假資料以獲取媒合資訊，或進而利用該資訊向政府機關進行不實申請，所產生之法律責任概由您自行承擔。</p>
                <p><strong class="text-orange-800">結果誤差：</strong> 由於福利法規變動頻繁，或因您輸入的資料不夠精確，我們不保證資訊的絕對準確性、完整性或即時性。</p>
              </div>
            </section>

            <section class="space-y-8">
              <div>
                 <h2 class="text-lg font-bold text-gray-900 mb-2 flex items-center gap-3">
                    <span class="bg-gray-900 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shadow-gray-200">6</span>
                    使用者的守法義務
                 </h2>
                 <p class="text-gray-600 pl-10 md:pl-0">您承諾絕不為任何非法目的使用本服務，並承諾遵守中華民國相關法規。您同意不得冒用他人名義、惡意攻擊系統或未經授權蒐集他人資料。</p>
              </div>
              
              <div>
                 <h2 class="text-lg font-bold text-gray-900 mb-2 flex items-center gap-3">
                    <span class="bg-gray-900 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shadow-gray-200">7</span>
                    服務之變更與終止
                 </h2>
                 <p class="text-gray-600 pl-10 md:pl-0">我們保留隨時修改、暫停或終止本服務的權利。於系統保養、故障、電子通信服務停止或天災等不可抗力因素發生時，我們有權暫停或中斷本服務。</p>
              </div>

              <div>
                 <h2 class="text-lg font-bold text-gray-900 mb-2 flex items-center gap-3">
                    <span class="bg-gray-900 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shadow-gray-200">8</span>
                    智慧財產權
                 </h2>
                 <p class="text-gray-600 pl-10 md:pl-0">本服務所有內容（包括軟體、圖片、資訊、網頁設計等）之智慧財產權均由 哞福利 或其他權利人依法擁有。任何人不得逕自使用、重製或公開發表。</p>
              </div>

              <div>
                 <h2 class="text-lg font-bold text-gray-900 mb-2 flex items-center gap-3">
                    <span class="bg-gray-900 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shadow-gray-200">9</span>
                    責任限制
                 </h2>
                 <p class="text-gray-600 pl-10 md:pl-0">在法律允許的最大範圍內，對於因使用或無法使用本服務而產生的任何直接、間接、附隨、特別、衍生性或懲罰性損害，我們不負任何賠償責任。</p>
              </div>

              <div>
                 <h2 class="text-lg font-bold text-gray-900 mb-2 flex items-center gap-3">
                    <span class="bg-gray-900 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shadow-gray-200">10</span>
                    準據法與管轄法院
                 </h2>
                 <p class="text-gray-600 pl-10 md:pl-0">本服務條款之解釋與適用，以及與本服務條款有關的爭議，均應依照中華民國法律予以處理，並以臺灣臺北地方法院為第一審管轄法院。</p>
              </div>
            </section>

            <section class="mt-12 pt-8 border-t border-gray-100">
              <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-3">
                <span class="bg-gray-900 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shadow-gray-200">11</span>
                聯絡我們
              </h2>
              <p class="mb-4 text-gray-600">若您對本服務條款有任何疑問，請透過以下方式聯繫我們：</p>
              
              <div class="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center gap-3">
                 <div class="w-10 h-10 bg-white rounded-full flex items-center justify-center text-gray-600 shadow-sm border border-gray-100">
                    <Icon icon="mingcute:mail-line" class="text-xl" />
                 </div>
                 <div>
                    <div class="text-xs text-gray-400 font-bold uppercase tracking-wider">聯絡信箱</div>
                    <a href="mailto:info@mou-welfare.com" class="text-gray-800 font-bold hover:text-blue-600 transition-colors">info@mou-welfare.com</a>
                 </div>
              </div>
            </section>

            <div class="pt-10 text-center text-xs text-gray-400">
               &copy; 2026 哞福利. All rights reserved.
            </div>

          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 隱藏 Chrome, Safari and Opera 的滾動條，但保留滾動功能 (可選) */
.scrollbar-hide::-webkit-scrollbar {
    display: none;
}
.scrollbar-hide {
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */
}
</style>