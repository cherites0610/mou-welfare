<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useUserStore } from '@/stores/user'
import { useFamilyStore } from '@/stores/family'

const user = useUserStore()
const familyStore = useFamilyStore()

export interface FilterState {
  search: string
  cities: string[]
  categories: string[]
  family: string | null
  isAuto: boolean
  userId?: string
  identities: string[]
}

const emit = defineEmits<{
  (e: 'change', filters: FilterState): void
  (e: 'click-collect'): void
  (e: 'click-question'): void
}>()

// --- 狀態管理 ---
const activeDropdown = ref<string | null>(null)
const search = ref('')
const isDesktop = ref(typeof window !== 'undefined' ? window.innerWidth >= 768 : true)
const selectedCities = ref<string[]>([])
const selectedCategories = ref<string[]>([])

const selectedFamilyId = ref<string | null>(null)

const isAutoFilter = ref(false)

const isFilterOpen = ref(false) // 控制篩選窗開關
const selectedIdentities = ref<string[]>([]) // 最終確定的篩選條件
const tempIdentities = ref<string[]>([]) // 暫存 (使用者還在選的時候)

const filterOptions = reactive({
  cities: [
    '基隆市',
    '台北市',
    '新北市',
    '桃園市',
    '新竹市',
    '新竹縣',
    '宜蘭縣',
    '苗栗縣',
    '台中市',
    '彰化縣',
    '南投縣',
    '雲林縣',
    '嘉義市',
    '嘉義縣',
    '台南市',
    '高雄市',
    '屏東縣',
    '花蓮縣',
    '台東縣',
    '澎湖縣',
    '金門縣',
    '連江縣',
  ],
  categories: [
    '兒童及青少年福利',
    '婦女與幼兒福利',
    '老人福利',
    '社會救助福利',
    '身心障礙福利',
    '其他福利',
  ],
})

// 定義進階選項與配色
const advancedOptions = [
  {
    label: '年齡',
    colorClass: 'text-orange-500 border-orange-500',
    activeClass: 'bg-orange-500 text-white border-orange-500',
    options: ['20歲以下', '20歲-65歲', '65歲以上'],
  },
  {
    label: '性別',
    colorClass: 'text-blue-500 border-blue-500',
    activeClass: 'bg-blue-500 text-white border-blue-500',
    options: ['男性', '女性'],
  },
  {
    label: '收入',
    colorClass: 'text-fuchsia-500 border-fuchsia-500',
    activeClass: 'bg-fuchsia-500 text-white border-fuchsia-500',
    options: ['中低收入戶', '低收入戶'],
  },
  {
    label: '身分別',
    colorClass: 'text-myblue-green border-myblue-green',
    activeClass: 'bg-myblue-green text-white border-myblue-green',
    options: ['榮民', '身心障礙', '新住民', '原住民', '單親家庭'],
  },
]
// 打開篩選視窗
const openFilter = () => {
  // 打開時，把目前已生效的條件複製到暫存區
  tempIdentities.value = [...selectedIdentities.value]
  isFilterOpen.value = true
}

// 關閉篩選視窗
const closeFilter = () => {
  isFilterOpen.value = false
}

// 點擊標籤 (Toggle)
const toggleIdentity = (tag: string) => {
  const index = tempIdentities.value.indexOf(tag)
  if (index === -1) {
    tempIdentities.value.push(tag)
  } else {
    tempIdentities.value.splice(index, 1)
  }
}

// 清除所有暫存
const clearFilter = () => {
  tempIdentities.value = []
}

// 確定套用
const confirmFilter = () => {
  selectedIdentities.value = [...tempIdentities.value]
  isFilterOpen.value = false
  if (selectedIdentities.value.length > 0) {
    isAutoFilter.value = false
  }
  triggerChange() // 觸發更新
}

// --- 顯示邏輯 (Computed) ---
const cityButtonText = computed(() => {
  if (selectedCities.value.length === 0) return '地區'
  if (selectedCities.value.length === 1) return selectedCities.value[0]
  return `地區 (${selectedCities.value.length})`
})

const categoryButtonText = computed(() => {
  if (selectedCategories.value.length === 0) return '服務'
  if (selectedCategories.value.length === 1) return selectedCategories.value[0]
  return `服務 (${selectedCategories.value.length})`
})

const familyButtonText = computed(() => {
  if (!selectedFamilyId.value) return '家庭'
  // 從 store 列表裡找名字
  const found = familyStore.familyList.find((f) => f.id === selectedFamilyId.value)
  return found ? found.name : '家庭'
})

// --- 互動邏輯 ---
const toggleDropdown = (type: string) => {
  activeDropdown.value = activeDropdown.value === type ? null : type
}

const toggleSelection = (type: 'city' | 'category', value: string) => {
  const targetArray = type === 'city' ? selectedCities : selectedCategories
  const index = targetArray.value.indexOf(value)
  if (index === -1) {
    targetArray.value.push(value)
  } else {
    targetArray.value.splice(index, 1)
  }
  triggerChange()
}

const clearSelection = (type: 'city' | 'category') => {
  if (type === 'city') selectedCities.value = []
  if (type === 'category') selectedCategories.value = []
  triggerChange()
}

const selectFamily = (id: string | null) => {
  selectedFamilyId.value = id
  activeDropdown.value = null
  triggerChange()
}

const toggleAutoFilter = () => {
  isAutoFilter.value = !isAutoFilter.value
  if (isAutoFilter.value) {
    selectedIdentities.value = []
    tempIdentities.value = []
  }
  triggerChange()
}

// 通知父組件
const triggerChange = () => {
  const currentUserId = isAutoFilter.value ? user.userInfo?.id : undefined

  emit('change', {
    search: search.value,
    cities: selectedCities.value,
    categories: selectedCategories.value,
    family: selectedFamilyId.value,
    isAuto: isAutoFilter.value,
    userId: currentUserId,
    identities: selectedIdentities.value,
  })
}
</script>

<template>
  <div class="sticky top-0 z-40 bg-gray-50">
    <div class="bg-white border-b border-gray-100 relative z-40">
      <div class="flex items-center justify-between px-4 py-3 text-sm text-gray-600">
        <div class="flex items-center gap-4 md:gap-6">
          <div class="relative">
            <div
              @click="toggleDropdown('city')"
              class="flex items-center gap-1 cursor-pointer hover:text-gray-900 select-none"
              :class="{
                'text-mygreen font-bold': activeDropdown === 'city' || selectedCities.length > 0,
              }"
            >
              <span>{{ cityButtonText }}</span>
              <Icon
                icon="mingcute:down-line"
                class="transition-transform duration-300"
                :class="{ 'rotate-180': activeDropdown === 'city' }"
              />
            </div>

            <div
              v-if="activeDropdown === 'city'"
              class="absolute top-full left-0 mt-2 min-w-45 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-fade-in-down"
            >
              <ul class="max-h-60 overflow-y-auto py-1">
                <li
                  v-for="city in filterOptions.cities"
                  :key="city"
                  @click="toggleSelection('city', city)"
                  class="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <Icon
                    :icon="
                      selectedCities.includes(city)
                        ? 'mingcute:checkbox-line'
                        : 'mingcute:square-line'
                    "
                    class="text-xl"
                    :class="selectedCities.includes(city) ? 'text-mygreen' : 'text-gray-300'"
                  />
                  <span :class="{ 'text-mygreen font-medium': selectedCities.includes(city) }">{{
                    city
                  }}</span>
                </li>
              </ul>
              <div class="p-2 border-t border-gray-100">
                <button
                  @click="clearSelection('city')"
                  class="w-full py-1.5 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors font-medium flex items-center justify-center gap-1"
                >
                  <Icon icon="mingcute:delete-2-line" />
                  清除篩選
                </button>
              </div>
            </div>
          </div>

          <div class="relative">
            <div
              @click="toggleDropdown('category')"
              class="flex items-center gap-1 cursor-pointer hover:text-gray-900 select-none"
              :class="{
                'text-mygreen font-bold':
                  activeDropdown === 'category' || selectedCategories.length > 0,
              }"
            >
              <span>{{ categoryButtonText }}</span>
              <Icon
                icon="mingcute:down-line"
                class="transition-transform duration-300"
                :class="{ 'rotate-180': activeDropdown === 'category' }"
              />
            </div>

            <div
              v-if="activeDropdown === 'category'"
              class="absolute top-full left-0 mt-2 min-w-[200px] bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-fade-in-down"
            >
              <ul class="max-h-60 overflow-y-auto py-1">
                <li
                  v-for="cat in filterOptions.categories"
                  :key="cat"
                  @click="toggleSelection('category', cat)"
                  class="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-gray-50"
                >
                  <Icon
                    :icon="
                      selectedCategories.includes(cat)
                        ? 'mingcute:checkbox-line'
                        : 'mingcute:square-line'
                    "
                    class="text-xl"
                    :class="selectedCategories.includes(cat) ? 'text-mygreen' : 'text-gray-300'"
                  />
                  <span :class="{ 'text-mygreen font-medium': selectedCategories.includes(cat) }">{{
                    cat
                  }}</span>
                </li>
              </ul>
              <div class="p-2 border-t border-gray-100">
                <button
                  @click="clearSelection('category')"
                  class="w-full py-1.5 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors font-medium flex items-center justify-center gap-1"
                >
                  <Icon icon="mingcute:delete-2-line" />
                  清除篩選
                </button>
              </div>
            </div>
          </div>

          <div class="relative">
            <div
              @click="toggleDropdown('family')"
              class="flex items-center gap-1 cursor-pointer hover:text-gray-900 select-none"
              :class="{ 'text-mygreen font-bold': activeDropdown === 'family' || selectedFamilyId }"
            >
              <span>{{ familyButtonText }}</span>

              <Icon
                icon="mingcute:down-line"
                class="transition-transform duration-300"
                :class="{ 'rotate-180': activeDropdown === 'family' }"
              />
            </div>

            <div
              v-if="activeDropdown === 'family'"
              class="absolute top-full left-0 mt-2 min-w-[160px] bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-fade-in-down"
            >
              <ul class="max-h-60 overflow-y-auto py-1">
                <li
                  v-for="fam in familyStore.familyList"
                  :key="fam.id"
                  @click="selectFamily(fam.id)"
                  class="px-4 py-2.5 flex justify-between items-center hover:bg-gray-50 cursor-pointer"
                  :class="{ 'text-mygreen bg-green-50 font-medium': selectedFamilyId === fam.id }"
                >
                  {{ fam.name }}

                  <Icon v-if="selectedFamilyId === fam.id" icon="mingcute:check-line" />
                </li>
              </ul>
              <div class="p-2 border-t border-gray-100">
                <button
                  @click="selectFamily(null)"
                  class="w-full py-1.5 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors font-medium flex items-center justify-center gap-1"
                >
                  <Icon icon="mingcute:delete-2-line" />
                  清除篩選
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <div
            @click="toggleAutoFilter"
            class="flex items-center gap-1 cursor-pointer select-none transition-colors"
            :class="isAutoFilter ? 'text-mygreen font-bold' : 'text-gray-500'"
          >
            <Icon
              :icon="
                isAutoFilter
                  ? 'material-symbols:hdr-auto-rounded'
                  : 'material-symbols:hdr-auto-outline-rounded'
              "
              class="text-2xl"
            />
            <span class="hidden md:flex">自動篩選</span>
          </div>

          <div
            @click="openFilter"
            class="flex items-center gap-1 cursor-pointer select-none transition-colors"
            :class="selectedIdentities.length > 0 ? 'text-mygreen font-bold' : 'text-gray-500'"
          >
            <Icon
              :icon="
                selectedIdentities.length > 0 ? 'mingcute:filter-fill' : 'mingcute:filter-line'
              "
              class="text-2xl"
            />
            <span class="hidden md:flex">篩選</span>
            <span
              v-if="selectedIdentities.length > 0"
              class="flex md:hidden w-2 h-2 bg-red-500 rounded-full absolute top-3 right-3"
            ></span>
          </div>
        </div>
      </div>

      <div
        v-if="isFilterOpen"
        class="md:hidden absolute top-full left-0 w-full bg-white border-b border-t border-gray-200 shadow-xl z-50 animate-slide-down"
      >
        <div class="max-h-[60vh] overflow-y-auto p-5 space-y-3">
          <div v-for="(section, idx) in advancedOptions" :key="idx">
            <h4 class="text-sm font-bold text-gray-800 mb-2">{{ section.label }}</h4>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="opt in section.options"
                :key="opt"
                @click="toggleIdentity(opt)"
                class="px-4 py-1.5 rounded-full text-sm font-medium border transition-all duration-200"
                :class="
                  tempIdentities.includes(opt)
                    ? section.activeClass
                    : `bg-white ${section.colorClass}`
                "
              >
                {{ opt }}
              </button>
            </div>
          </div>
        </div>

        <div class="p-4 border-t border-gray-100 flex gap-3 bg-gray-50">
          <button
            @click="clearFilter"
            class="flex-1 py-2 rounded-lg border border-gray-300 text-gray-500 font-bold hover:bg-gray-100"
          >
            清除
          </button>
          <button
            @click="confirmFilter"
            class="flex-1 py-2 rounded-lg bg-mygreen text-white font-bold hover:bg-green-600"
          >
            確定 ({{ tempIdentities.length }})
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="isFilterOpen && !isDesktop"
      class="fixed inset-0 z-30 "
      @click="closeFilter"
    ></div>

    <transition name="fade">
      <div
        v-if="isFilterOpen"
        class="hidden md:flex fixed inset-0 z-[60] bg-black/50 backdrop-blur-[1px] items-center justify-center"
        @click.self="closeFilter"
      >
        <div class="bg-white rounded-2xl w-[500px] shadow-2xl flex flex-col max-h-[85vh]">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <span class="text-lg font-bold text-gray-800">進階篩選</span>
            <button
              @click="closeFilter"
              class="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <Icon icon="mingcute:close-line" class="text-2xl text-gray-400" />
            </button>
          </div>

          <div class="p-5 overflow-y-auto flex-1 space-y-6">
            <div v-for="(section, idx) in advancedOptions" :key="idx">
              <h4 class="text-sm font-bold text-gray-800 mb-3">{{ section.label }}</h4>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="opt in section.options"
                  :key="opt"
                  @click="toggleIdentity(opt)"
                  class="px-4 py-1.5 rounded-full text-sm font-medium border transition-all duration-200"
                  :class="
                    tempIdentities.includes(opt)
                      ? section.activeClass
                      : `bg-white ${section.colorClass}`
                  "
                >
                  {{ opt }}
                </button>
              </div>
            </div>
          </div>

          <div class="p-4 border-t border-gray-100 flex gap-3">
            <button
              @click="clearFilter"
              class="flex-1 py-2.5 rounded-xl border border-mygreen text-mygreen font-bold hover:text-mygreen-300"
            >
              清除
            </button>
            <button
              @click="confirmFilter"
              class="flex-1 py-2.5 rounded-xl bg-mygreen text-white font-bold shadow-lg hover:bg-mygreen-200"
            >
              確定 ({{ tempIdentities.length }})
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
  <div v-if="activeDropdown" class="fixed inset-0 z-30" @click="activeDropdown = null"></div>

</template>

<style scoped>
@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-down {
  animation: fadeInDown 0.2s ease-out forwards;
}

/* 下拉動畫 */
@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-slide-down {
  animation: slideDown 0.2s ease-out forwards;
}

/* Modal 動畫 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
