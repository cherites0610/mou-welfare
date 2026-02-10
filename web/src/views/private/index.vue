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
      class="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 h-14 flex items-center justify-between md:hidden">
      <button @click="goBack"
        class="w-8 h-8 flex items-center justify-center -ml-2 text-gray-600 hover:bg-gray-50 rounded-full transition-colors active:scale-95">
        <Icon icon="mingcute:left-line" class="text-2xl" />
      </button>

      <span class="font-bold text-lg text-gray-900">隱私權政策</span>

      <div class="w-8"></div>
    </div>

    <AppHeader class="hidden md:block mb-6" />

    <div class="flex flex-col h-[calc(100dvh-3.5rem)] md:h-[calc(100vh-8rem)] overflow-hidden">

      <div class="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 md:py-0 scroll-smooth">
        <div
          class="max-w-7xl px-6 mx-auto md:bg-white md:p-12 md:rounded-3xl md:shadow-sm md:border md:border-gray-100 mb-10 pb-20 md:pb-10 md:my-10">

          <div class="px-5 py-8 md:text-center md:border-b md:border-gray-100 md:mb-8">
            <h1 class="text-2xl md:text-3xl font-extrabold text-gray-900 mb-2 leading-tight">
              隱私權政策<br class="md:hidden" />(Privacy Policy)
            </h1>
            <p class="text-sm text-gray-400 font-medium mt-2 flex items-center gap-1 md:justify-center">
              <Icon icon="mingcute:time-line" />
              生效日期： 2026 年 1 月 1 日
            </p>
          </div>

          <div class="px-5 md:px-0 space-y-10 text-[15px] md:text-base leading-relaxed text-justify">

            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-3">
                <span
                  class="bg-gray-900 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shadow-gray-200">1</span>
                引言
              </h2>
              <p class="text-gray-600">
                歡迎您使用 <span class="font-bold text-gray-800">mou-welfare.com</span>（以下簡稱「本網站」）。本網站由 <span
                  class="font-bold text-gray-800">哞福利</span> 營運。我們致力於透過科技協助用戶進行福利資源媒合。本隱私權政策旨在說明我們如何收集、使用及保護您的個人資料。
              </p>
            </section>

            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-3">
                <span
                  class="bg-gray-900 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shadow-gray-200">2</span>
                我們收集的資料範疇
              </h2>
              <p class="mb-3 text-gray-600">為了提供精準的智慧福利媒合服務，我們會收集以下類型的資料：</p>

              <div class="mb-6">
                <h3 class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                  <span class="w-1.5 h-6 bg-blue-500 rounded-full"></span>
                  2.1 您主動提供的資料
                </h3>
                <div class="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
                  <div class="flex gap-3">
                    <Icon icon="mingcute:idcard-line" class="text-blue-500 text-xl shrink-0 mt-0.5" />
                    <div>
                      <span class="font-bold text-gray-700 text-sm block">基本識別資料</span>
                      <span class="text-sm text-gray-500">姓名、電子郵件地址 (Email)、性別。</span>
                    </div>
                  </div>
                  <div class="flex gap-3">
                    <Icon icon="mingcute:birthday-2-line" class="text-blue-500 text-xl shrink-0 mt-0.5" />
                    <div>
                      <span class="font-bold text-gray-700 text-sm block">特徵與屬性資料</span>
                      <span class="text-sm text-gray-500">出生年月日、年齡。</span>
                    </div>
                  </div>
                  <div class="flex gap-3">
                    <Icon icon="mingcute:tag-line" class="text-blue-500 text-xl shrink-0 mt-0.5" />
                    <div>
                      <span class="font-bold text-gray-700 text-sm block">福利身分與狀態</span>
                      <span class="text-sm text-gray-500">身分別（包括但不限於低收入戶、中低收入戶、身心障礙等福利資格狀態）。</span>
                    </div>
                  </div>
                  <div class="flex gap-3">
                    <Icon icon="mingcute:group-line" class="text-blue-500 text-xl shrink-0 mt-0.5" />
                    <div>
                      <span class="font-bold text-gray-700 text-sm block">家庭關係資料</span>
                      <span class="text-sm text-gray-500">您與其他帳號的關聯資訊（例如：家庭成員帳號綁定、家戶關係連結）。</span>
                    </div>
                  </div>
                  <p class="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-200">
                    （若您輸入的資料包含未成年子女或受監護宣告之親屬，您確認已代為行使同意權，並授權我們進行媒合運算。）
                  </p>
                </div>
              </div>

              <div
                class="bg-orange-50/50 -mx-5 px-5 py-6 md:mx-0 md:rounded-2xl md:px-6 border-l-4 border-orange-400 mb-6">
                <h3 class="font-bold text-orange-900 mb-2 flex items-center gap-2">
                  <Icon icon="mingcute:alert-line" class="text-xl" />
                  2.2 資料真實性聲明（重要）
                </h3>
                <p class="text-sm text-orange-900/80 leading-relaxed mb-2">
                  本網站所收集之上述資料，均由用戶基於自由意志主動填寫提供。本網站系統僅被動接收並儲存資料以進行運算，<strong
                    class="text-orange-800">我們「不會」也「無義務」對您提供的資料真實性、完整性或準確性進行實質審查或驗證。</strong>
                </p>
                <p class="text-sm text-orange-900/80">
                  若因您提供的資料不實導致媒合結果有誤或產生法律爭議，您需自行承擔相關責任。
                </p>
              </div>

              <div class="space-y-6">
                <div>
                  <h3 class="font-bold text-gray-800 mb-2">2.3 第三方登入服務 (Google 與 LINE)</h3>
                  <p class="text-sm text-gray-500 mb-2">若您選擇使用第三方帳戶登入，即表示您同意授權我們向該平台獲取基本資訊以建立帳號：</p>
                  <ul class="list-disc pl-5 space-y-1 text-sm text-gray-500">
                    <li><span class="font-bold text-gray-600">Google 登入：</span> 依 Google API 規範，收集您的 Google 帳戶名稱、Email
                      及個人頭像。</li>
                    <li><span class="font-bold text-gray-600">LINE 登入：</span> 依 LINE Login 規範，收集您的 LINE 使用者名稱、User
                      ID、個人頭像及狀態消息。</li>
                  </ul>
                </div>
                <div>
                  <h3 class="font-bold text-gray-800 mb-2">2.4 Cookies 與自動收集的技術資料</h3>
                  <p class="text-sm text-gray-500">當您訪問本網站時，伺服器會自動記錄 IP 位址、瀏覽器類型、訪問時間及 Log 記錄，用於系統維護與資安防護。此外，我們可能會使用
                    Cookies 或類似技術來記錄您的偏好設定，以優化您的瀏覽體驗。</p>
                </div>
              </div>
            </section>

            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-3">
                <span
                  class="bg-gray-900 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shadow-gray-200">3</span>
                資料的使用目的
              </h2>
              <p class="mb-3 text-gray-600">我們收集的資料僅用於以下特定目的：</p>
              <ul class="space-y-3">
                <li class="flex gap-3 text-sm text-gray-600">
                  <span class="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 shrink-0"></span>
                  <span><strong class="text-gray-800">智慧福利媒合（核心目的）：</strong>
                    利用您提供的年齡、身分別及家庭關係等數據，透過演算法為您篩選、推薦適合的社會福利補助或相關方案。</span>
                </li>
                <li class="flex gap-3 text-sm text-gray-600">
                  <span class="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 shrink-0"></span>
                  <span><strong class="text-gray-800">身分識別：</strong> 供系統辨識用戶以讀取歷史媒合紀錄。</span>
                </li>
                <li class="flex gap-3 text-sm text-gray-600">
                  <span class="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 shrink-0"></span>
                  <span><strong class="text-gray-800">服務優化：</strong> 分析去識別化後的數據，以改善媒合演算法的準確度。</span>
                </li>
                <li class="flex gap-3 text-sm text-gray-600">
                  <span class="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 shrink-0"></span>
                  <span><strong class="text-gray-800">通知聯繫：</strong> 發送媒合結果通知或系統重要公告。</span>
                </li>
              </ul>
            </section>

            <section class="bg-blue-50/50 -mx-5 px-5 py-6 md:mx-0 md:rounded-2xl md:px-6">
              <h2 class="text-lg font-bold text-blue-900 mb-4 flex items-center gap-3">
                <span
                  class="bg-blue-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shadow-blue-200">4</span>
                資料的分享與揭露
              </h2>
              <p class="mb-4 text-blue-800/80 text-sm">除以下情況外，我們絕不會將您的個人資料（尤其是您的福利身分與家庭狀況）提供給第三方：</p>
              <ul class="space-y-3">
                <li class="flex gap-3 text-sm text-blue-900">
                  <Icon icon="mingcute:check-circle-line" class="text-blue-500 shrink-0 mt-0.5" />
                  <span><strong class="text-blue-700">經您明確同意：</strong> 例如您希望我們協助將資料轉介給社福機構時。</span>
                </li>
                <li class="flex gap-3 text-sm text-blue-900">
                  <Icon icon="mingcute:check-circle-line" class="text-blue-500 shrink-0 mt-0.5" />
                  <span><strong class="text-blue-700">法律要求：</strong> 依法令規定或司法機關之正式要求。</span>
                </li>
                <li class="flex gap-3 text-sm text-blue-900">
                  <Icon icon="mingcute:check-circle-line" class="text-blue-500 shrink-0 mt-0.5" />
                  <span><strong class="text-blue-700">去識別化數據：</strong>
                    我們可能會將「無法識別特定個人」的統計數據（例如：某地區的福利需求分佈）用於學術研究或公益報告。</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-3">
                <span
                  class="bg-gray-900 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shadow-gray-200">5</span>
                資料安全與保存
              </h2>
              <p class="text-gray-600 mb-3">
                我們採用標準的安全技術（如 SSL 加密）保護您的資料在傳輸過程中的安全。<br>
                由於福利身分屬於較隱私之資訊，我們將嚴格控管資料庫的存取權限。
              </p>
              <div class="bg-gray-50 p-4 rounded-xl border border-gray-100 flex gap-3">
                <Icon icon="mingcute:delete-2-line" class="text-gray-400 text-xl shrink-0 mt-0.5" />
                <p class="text-sm text-gray-600">您可隨時登入系統修改或刪除您所輸入的福利資料，刪除後系統將不再保留該部分的運算依據。</p>
              </div>
            </section>

            <section>
              <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-3">
                <span
                  class="bg-gray-900 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shadow-gray-200">6</span>
                您的權利
              </h2>
              <p class="text-gray-600 mb-3">根據相關個人資料保護法規，您可以透過本網站設定或聯繫客服行使以下權利：</p>
              <ul class="space-y-2 pl-2 border-l-2 border-gray-100 ml-3">
                <li class="pl-4 text-sm text-gray-600">查詢或請求閱覽您的個人資料。</li>
                <li class="pl-4 text-sm text-gray-600">請求補充或更正您的資料（請注意，您需自行確保修正後資料的真實性）。</li>
                <li class="pl-4 text-sm text-gray-600">請求刪除特定欄位資料或完整帳號（Right to be Erasure）。</li>
                <li class="pl-4 text-sm text-gray-600">請求停止蒐集、處理或利用。</li>
              </ul>
            </section>

            <section>
              <h2 class="text-base font-bold text-gray-800 mb-2">7. 隱私權政策之修訂</h2>
              <p class="text-sm text-gray-500">本政策可能隨服務調整而修訂。最新版本將隨時公佈於 mou-welfare.com，重大變更將透過 Email 或網站公告通知。</p>
            </section>

            <section class="mt-12 pt-8 border-t border-gray-100 text-center">
              <h2 class="text-lg font-bold text-gray-900 mb-4">有任何疑問嗎？</h2>
              <div class="mb-4 text-sm text-gray-600">若您對本隱私權政策或資料處理有任何疑問，請聯繫我們：</div>
              <a href="mailto:info@mou-welfare.com"
                class="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-full font-bold shadow-lg shadow-gray-200 active:scale-95 transition-transform">
                <Icon icon="mingcute:mail-line" class="text-xl" />
                info@mou-welfare.com
              </a>
              <p class="mt-6 text-xs text-gray-300">
                &copy; 2026 哞福利. All rights reserved.
              </p>
            </section>

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
  -ms-overflow-style: none;
  /* IE and Edge */
  scrollbar-width: none;
  /* Firefox */
}
</style>
