<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'
import { useFamilyStore } from '@/stores/family'
import { useTagColor } from '@/composables/useTagColor'
import type { User } from '@/api/user/model'
import type { Family } from '@/api/family/model'
import { ElMessageBox } from 'element-plus'

const DEFAULT_AVATAR = 'https://storage.googleapis.com/mou-welfare/web/meta.png'

const router = useRouter()
const userStore = useUserStore()
const familyStore = useFamilyStore()
const { getTagColor } = useTagColor()

const { userInfo } = storeToRefs(userStore)
const { familyList: storeFamilyList } = storeToRefs(familyStore)

// --- 本地 UI 狀態 ---
interface FamilyUI extends Family {
  isOpen: boolean
}

const localFamilyList = ref<FamilyUI[]>([])
const showCreateDialog = ref(false)
const showJoinDialog = ref(false)

// --- 資料同步 ---
watch(
  storeFamilyList,
  (newList) => {
    if (newList && Array.isArray(newList)) {
      // 邏輯：預設展開第一個家庭
      localFamilyList.value = newList.map((f, index) => ({
        ...f,
        isOpen: index === 0,
      }))
    }
  },
  { immediate: true, deep: true },
)

// --- Helper Functions ---
const getDisplayName = (user: User | undefined | null) => {
  if (!user) return '讀取中...'
  return user.name || user.email?.split('@')[0] || '未命名用戶'
}

const currentUserTags = computed(() => {
  const user = userInfo.value
  if (!user) return []
  const tags: string[] = []

  if (user.gender) tags.push(user.gender)
  if (user.identities && Array.isArray(user.identities)) {
    tags.push(...user.identities)
  }
  return tags
})

const toggleFamily = (id: string) => {
  const target = localFamilyList.value.find((f) => f.id === id)
  if (target) target.isOpen = !target.isOpen
}

const handleQuitFamily = async (familyId: string) => {
  const currentUserId = userStore.userInfo?.id
  if (!currentUserId) {
    ElMessage.warning('請先登入')
    return
  }
  const targetFamily = familyStore.familyList.find(f => f.id === familyId)
  if (!targetFamily) return
  const myMembership = targetFamily.userFamilies?.find(m => m.userId === currentUserId)
  if (!myMembership) {
    ElMessage.error('找不到您的成員資料，無法退出')
    return
  }
  try {
    await ElMessageBox.confirm(
      `確定要退出「${targetFamily.name}」嗎？\n退出後需重新邀請才能加入。`,
      '退出家庭',
      {
        confirmButtonText: '確定退出',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger' // 讓確認按鈕變紅色，警示作用
      }
    )
    await familyStore.removeMember(myMembership.id)
    await familyStore.loadFamilies()
    ElMessage.success('已成功退出家庭')
  } catch (error) {
    if (error !== 'cancel') {
      console.error(error)
      ElMessage.error('退出失敗，請稍後再試')
    }
  }
}

const handleFamilyCommand = (command: 'create' | 'join') => {
  if (command === 'create') {
    showCreateDialog.value = true
  } else if (command === 'join') {
    showJoinDialog.value = true
  }
}

const joinCode =()=>{
  console.log('生成邀請碼')
}

const goEditProfile = () => router.push('/profile/edit')
const goQuestions = () => router.push('/question')
const goFavorites = () => router.push('/favorites')
const goTerms = () => router.push('/terms')
const goPrivate = () => router.push('/private')
</script>

<template>
  <div class="min-h-screen bg-white pb-10 font-sans text-gray-800">
    <div class="max-w-7xl mx-auto px-4 md:pt-10">
      <div
        class="bg-white md:rounded-3xl p-6 md:p-8 relative z-10 mb-8 border-b md:border border-gray-100"
      >
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="flex items-center gap-5">
            <div
              class="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gray-50 p-1 border border-gray-100 shrink-0 overflow-hidden"
            >
              <img
                :src="userInfo?.avatarUrl || DEFAULT_AVATAR"
                class="w-full h-full rounded-full object-cover bg-white"
              />
            </div>

            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <h1 class="text-2xl md:text-3xl font-bold text-gray-800">
                  {{ getDisplayName(userInfo) }}
                </h1>
                <button
                  @click="goEditProfile"
                  class="text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <Icon icon="mingcute:edit-line" class="text-2xl" />
                </button>
              </div>
            </div>
          </div>

          <button
            class="hidden md:block text-gray-400 hover:text-gray-600 transition-transform hover:rotate-45 duration-300"
          >
            <Icon icon="mingcute:settings-3-line" class="text-3xl" />
          </button>
        </div>

        <div class="mt-6 flex flex-wrap items-center gap-3">
          <span class="text-gray-800 font-medium text-lg">身分別 :</span>
          <div class="flex flex-wrap gap-2">
            <template v-if="currentUserTags.length > 0">
              <span
                v-for="tag in currentUserTags"
                :key="tag"
                class="px-3 py-1 rounded-lg text-white text-xs font-bold shadow-sm"
                :class="getTagColor(tag)"
              >
                {{ tag }}
              </span>
            </template>
            <span v-else class="text-sm text-gray-400 py-1">尚未設定身分別</span>
          </div>
        </div>
      </div>

      <div class="flex justify-between items-center mb-4 px-2 md:px-0">
        <h2 class="text-xl font-bold text-gray-800">家庭列表</h2>
        <div class="flex justify-between items-center mb-4 px-2 md:px-0">
          <el-dropdown trigger="click" @command="handleFamilyCommand" placement="bottom-end">
            <button class="text-[#84cc16] hover:text-green-600 transition-transform active:scale-90 outline-none">
              <Icon icon="mingcute:add-circle-line" class="text-3xl" />
            </button>

            <template #dropdown>
              <el-dropdown-menu class="rounded-xl overflow-hidden p-1">

                <el-dropdown-item command="create" class="rounded-lg">
                  <div class="flex items-center gap-2 py-1 px-1 text-gray-700">
                    <div class="bg-green-100 text-[#84cc16] p-1 rounded-full">
                      <Icon icon="mingcute:home-6-line" class="text-lg" />
                    </div>
                    <span class="font-bold">創建家庭</span>
                  </div>
                </el-dropdown-item>

                <el-dropdown-item command="join" divided class="rounded-lg">
                  <div class="flex items-center gap-2 py-1 px-1 text-gray-700">
                    <div class="bg-blue-100 text-blue-500 p-1 rounded-full">
                      <Icon icon="mingcute:group-2-line" class="text-lg" />
                    </div>
                    <span class="font-bold">加入家庭</span>
                  </div>
                </el-dropdown-item>

              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <div
          v-for="family in localFamilyList"
          :key="family.id"
          class="bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 border border-gray-100 hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] transition-shadow duration-300"
        >
          <div class="flex items-center justify-between cursor-pointer select-none" @click="toggleFamily(family.id)">
            <h3 class="text-xl font-bold text-gray-800">
              {{ family.name }} ( {{ family.userFamilies?.length || 0 }} )
            </h3>

            <div class="flex items-center gap-4 text-gray-400">
              <Icon @click.stop="joinCode()" icon="mingcute:grid-line" class="text-2xl hover:text-gray-600" />

              <Icon icon="mingcute:down-line" class="text-2xl transition-transform duration-300"
                :class="{ 'rotate-180': family.isOpen }" />
            </div>
          </div>

          <div v-show="!family.isOpen" class="mt-4 flex items-center">
            <div class="flex -space-x-3 overflow-hidden p-1">
              <template v-if="family.userFamilies && family.userFamilies.length > 0">
                <img
                  v-for="member in family.userFamilies.slice(0, 5)"
                  :key="member.id"
                  :src="member.user?.avatarUrl || DEFAULT_AVATAR"
                  class="inline-block h-10 w-10 rounded-full ring-2 ring-white bg-gray-50 object-cover border border-gray-100"
                />
              </template>
              <span v-else class="text-sm text-gray-400 ml-2">暫無成員</span>
            </div>
          </div>

          <div v-show="family.isOpen" class="mt-6 space-y-6">
            <template v-if="family.userFamilies && family.userFamilies.length > 0">
              <div
                v-for="member in family.userFamilies"
                :key="member.id"
                class="flex items-start gap-4"
              >
                <div
                  class="w-12 h-12 rounded-full bg-gray-50 shrink-0 border border-gray-100 overflow-hidden"
                >
                  <img
                    :src="member.user?.avatarUrl || DEFAULT_AVATAR"
                    class="w-full h-full object-cover"
                  />
                </div>

                <div class="flex-1 min-w-0 pt-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-base font-bold text-gray-800 mr-1">
                      {{ getDisplayName(member.user) }}
                    </span>

                    <template v-if="member.user?.identities?.length">
                      <span
                        v-for="tag in member.user.identities"
                        :key="tag"
                        class="px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm"
                        :class="getTagColor(tag)"
                      >
                        {{ tag }}
                      </span>
                    </template>

                    <span
                      v-if="member.user?.gender"
                      class="px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm"
                      :class="getTagColor(member.user.gender)"
                    >
                      {{ member.user.gender }}
                    </span>

                    <span
                      v-if="!member.user?.identities?.length && !member.user?.gender"
                      class="text-xs text-gray-400"
                    >
                      目前尚無設定身分別
                    </span>
                  </div>
                </div>

                <button class="text-gray-300 hover:text-gray-500">
                  <Icon icon="mingcute:more-2-fill" class="text-xl" />
                </button>
              </div>
            </template>

            <div v-else class="text-gray-400 text-center py-4 text-sm">此家庭暫無其他成員</div>

            <div class="pt-2 flex justify-center">
              <button
                @click.stop="handleQuitFamily(family.id)"
                class="w-40 border border-[#84cc16] text-[#84cc16] font-bold py-2 rounded-full hover:bg-[#84cc16] hover:text-white transition-colors duration-300 text-sm shadow-sm"
              >
                退出
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-4 mb-10">
        <h2 class="text-gray-800 font-bold text-lg px-2 md:px-0">其他</h2>

        <div
          class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50"
        >
          <button
            @click="goQuestions"
            class="w-full flex items-center gap-4 p-5 hover:bg-gray-50 transition text-left group"
          >
            <Icon
              icon="mingcute:question-line"
              class="text-xl text-gray-800 group-hover:scale-110 transition-transform"
            />
            <span class="font-bold text-gray-800">常見問題</span>
          </button>

          <button
            @click="goFavorites"
            class="w-full flex items-center gap-4 p-5 hover:bg-gray-50 transition text-left group"
          >
            <Icon
              icon="mdi:heart-outline"
              class="text-xl text-gray-800 group-hover:scale-110 transition-transform"
            />
            <span class="font-bold text-gray-800">已收藏之福利</span>
          </button>

          <button
            @click="goTerms"
            class="w-full flex items-center gap-4 p-5 hover:bg-gray-50 transition text-left group"
          >
            <Icon
              icon="wordpress:post-terms"
              class="text-xl text-gray-800 group-hover:scale-110 transition-transform"
            />
            <span class="font-bold text-gray-800">應用程式服務條款</span>
          </button>

          <button
            @click="goPrivate"
            class="w-full flex items-center gap-4 p-5 hover:bg-gray-50 transition text-left group"
          >
            <Icon
              icon="mingcute:lock-line"
              class="text-xl text-gray-800 group-hover:scale-110 transition-transform"
            />
            <span class="font-bold text-gray-800">隱私權政策</span>
          </button>
        </div>
      </div>
    </div>
  </div>
  <CreateFamilyDialog v-model="showCreateDialog" />
  <JoinFamilyDialog v-model="showJoinDialog" />
</template>

<style scoped></style>
