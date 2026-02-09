<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'

const router = useRouter()

const goBack = () => {
  router.back()
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 font-sans text-gray-700">
    
    <div
      class="sticky top-0 z-40 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-4 h-14 flex items-center justify-between md:hidden shadow-sm"
    >
      <button
        @click="goBack"
        class="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
      >
        <Icon icon="mingcute:left-line" class="text-2xl" />
      </button>

      <span class="font-bold text-lg text-gray-800">服務條款</span>

      <div class="w-8"></div>
    </div>

    <AppHeader class="hidden md:block mb-6" />

    <div class="flex flex-col h-[calc(100dvh-3.5rem)] md:h-[calc(100vh-8rem)] overflow-hidden">
      
      <div class="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 md:py-0">
        <div class="max-w-7xl mx-auto  md:p-10 md:rounded-2xl md:shadow-sm md:border md:border-gray-100 mb-10">
          
          <div class="text-center mb-8 border-b border-gray-100 pb-6">
            <h1 class="text-2xl md:text-3xl font-bold text-gray-900 mb-2">應用程式服務條款</h1>
            <p class="text-sm text-gray-500">生效日期： 2026 年 1 月 1 日</p>
          </div>

          <div class="space-y-8 text-sm md:text-base leading-relaxed text-justify">
            
            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span class="bg-gray-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                同意條款
              </h2>
              <p>
                歡迎您使用 mou-welfare.com（以下簡稱「本服務」或「本網站」），本服務由 哞福利（以下簡稱「我們」）營運。當您開始使用本服務（包括瀏覽網站、註冊帳號或使用福利媒合功能），即表示您已閱讀、瞭解並同意接受本服務條款之所有內容。若您不同意本條款的任何部分，請立即停止使用本服務。
              </p>
            </section>

            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span class="bg-gray-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                服務內容與性質
              </h2>
              <p class="mb-2">本服務主要提供「智慧福利媒合」功能，透過使用者輸入的資料與福利法規資料庫進行比對，提供福利補助的資訊索引與推薦。 請注意：</p>
              <ul class="list-disc pl-5 space-y-1 text-gray-600 bg-gray-50 p-4 rounded-lg">
                <li>本服務僅為資訊媒合工具，並非政府機關或社福機構之官方代表。</li>
                <li>本服務所提供的媒合結果僅供參考，不代表您必然獲得該項福利或補助的核准。</li>
                <li>所有福利申請的最終審核權與決定權，均屬於該福利項目的主管機關或發放單位。</li>
              </ul>
            </section>

            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span class="bg-gray-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">3</span>
                AI 技術應用與風險聲明（新增）
              </h2>
              <p class="mb-2">本服務部分功能採用了先進的 人工智慧（Artificial Intelligence, AI） 技術進行資料分析與內容生成。針對 AI 技術之特性，您理解並同意以下事項：</p>
              <ul class="list-disc pl-5 space-y-2 text-gray-600">
                <li><span class="font-bold text-gray-700">AI 幻覺與誤差：</span> 生成式 AI 模型在運算過程中，可能會產生看似合理但實際上不準確、過時或完全虛構的資訊（即所謂的「AI 幻覺」）。</li>
                <li><span class="font-bold text-gray-700">非專業建議：</span> AI 生成之內容僅供參考輔助，不應被視為最終的法律、醫療或專業財務建議。</li>
                <li><span class="font-bold text-gray-700">查證義務：</span> 在您依據本服務提供的 AI 媒合結果採取任何行動（如申請補助）前，您有義務自行向相關政府機關或官方網站查證資訊的正確性。我們不對因 AI 生成內容之錯誤或誤差所導致的任何損失承擔責任。</li>
              </ul>
            </section>

            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span class="bg-gray-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">4</span>
                帳號註冊與安全
              </h2>
              <p class="mb-2">為了使用特定功能，您需透過 Google 或 LINE 帳號進行登入驗證。</p>
              <ul class="list-disc pl-5 space-y-1 text-gray-600">
                <li><span class="font-bold text-gray-700">資料正確性：</span> 您同意提供正確、最新且完整的個人資料。</li>
                <li><span class="font-bold text-gray-700">帳號安全：</span> 您有責任維護您第三方帳號（Google/LINE）的安全性。若因您的設備遺失或帳號遭盜用而導致資料外洩，本服務不負賠償責任。</li>
                <li><span class="font-bold text-gray-700">禁止共用：</span> 除非屬於家庭帳號管理功能，否則請勿將您的帳號轉讓或出借予他人使用。</li>
              </ul>
            </section>

            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span class="bg-gray-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">5</span>
                使用者資料與免責聲明（重要）
              </h2>
              <div class="bg-orange-50 border-l-4 border-orange-400 p-4 rounded-r-lg">
                <p class="mb-2 font-medium text-orange-800">基於本服務之運作特性，我們對使用者資料及媒合結果做以下特別聲明：</p>
                <ul class="list-disc pl-5 space-y-2 text-orange-700">
                  <li><span class="font-bold">自主申報原則：</span> 本服務之運算基礎完全依賴您所輸入的資料（如：身分別、收入狀況、家庭關係等）。我們不會，亦無權限與義務查核您提供資料的真實性。</li>
                  <li><span class="font-bold">資料責任：</span> 若您故意輸入虛假資料（例如：偽造低收入戶身分）以獲取媒合資訊，或進而利用該資訊向政府機關進行不實申請，所產生之法律責任（如詐欺、偽造文書）概由您自行承擔，與本服務無關。</li>
                  <li><span class="font-bold">結果誤差：</span> 由於福利法規變動頻繁，或因您輸入的資料不夠精確，媒合結果可能與實際情況有所出入。我們不保證資訊的絕對準確性、完整性或即時性。</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span class="bg-gray-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">6</span>
                使用者的守法義務及承諾
              </h2>
              <p class="mb-2">您承諾絕不為任何非法目的或以任何非法方式使用本服務，並承諾遵守中華民國相關法規及一切使用網際網路之國際慣例。您同意並保證不得利用本服務從事侵害他人權益或違法之行為，包括但不限於：</p>
              <ul class="list-disc pl-5 space-y-1 text-gray-600">
                <li>冒用他人名義使用本服務。</li>
                <li>惡意攻擊、破壞本服務之系統運作或擷取非經授權之資料。</li>
                <li>未經授權蒐集他人之個人資料。</li>
              </ul>
            </section>

            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span class="bg-gray-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">7</span>
                服務之變更、中斷或終止
              </h2>
              <p class="mb-2">我們保留隨時修改、暫停或終止本服務（或其任何部分）的權利，恕不另行通知。於下列情形發生時，我們有權暫停或中斷本服務：</p>
              <ul class="list-disc pl-5 space-y-1 text-gray-600">
                <li>網站電子通信設備進行必要之保養及施工時。</li>
                <li>突發性之電子通信設備故障時。</li>
                <li>申請之電子通信服務被停止，無法提供服務時。</li>
                <li>因天災等不可抗力之因素致使無法提供服務時。</li>
              </ul>
            </section>

            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span class="bg-gray-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">8</span>
                智慧財產權
              </h2>
              <p>
                本服務所使用之軟體或程式、網站上所有內容（包括但不限於著作、圖片、檔案、資訊、資料、網站架構、網站畫面的安排、網頁設計），均由 哞福利 或其他權利人依法擁有其智慧財產權。任何人不得逕自使用、修改、重製、公開播送、改作、散布、發行或公開發表。
              </p>
            </section>

            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span class="bg-gray-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">9</span>
                責任限制
              </h2>
              <p>
                在法律允許的最大範圍內，對於因使用或無法使用本服務而產生的任何直接、間接、附隨、特別、衍生性或懲罰性損害（包括但不限於利益損失、資料流失），我們不負任何賠償責任。
              </p>
            </section>

            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span class="bg-gray-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">10</span>
                準據法與管轄法院
              </h2>
              <p>
                本服務條款之解釋與適用，以及與本服務條款有關的爭議，均應依照中華民國法律予以處理，並以臺灣臺北地方法院為第一審管轄法院。
              </p>
            </section>

            <section class="mt-10 pt-6 border-t border-gray-100">
              <h2 class="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span class="bg-gray-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">11</span>
                聯絡我們
              </h2>
              <div class="flex items-center gap-2 text-gray-700 bg-gray-50  rounded-lg ">
                              <p class="">若您對本服務條款有任何疑問，請透過以下方式聯繫我們：</p>

                <Icon icon="mingcute:mail-line" class="text-xl" />
                <a href="mailto:info@mou-welfare.com" class="hover:text-blue-600 transition-colors font-medium">info@mou-welfare.com</a>
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