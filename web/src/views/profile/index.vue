<script setup lang="ts">
import { generateJoinCode } from '@/api/family'
import type { Family } from '@/api/family/model'
import type { UpdateUserDto, User } from '@/api/user/model'
import CreateFamilyDialog from '@/components/Family/CreateFamilyDialog.vue'
import EditFamilyDialog from '@/components/Family/EditFamilyDialog.vue'
import JoinFamilyDialog from '@/components/Family/JoinFamilyDialog.vue'
import { useSession } from '@/composables/useSession'
import { useTagColor } from '@/composables/useTagColor'
import { useFamilyStore } from '@/stores/family'
import { useUserStore } from '@/stores/user'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import QRCode from 'qrcode'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
const DEFAULT_AVATAR = 'https://storage.googleapis.com/mou-welfare/web/meta.png'

const router = useRouter()
const userStore = useUserStore()
const familyStore = useFamilyStore()
const { getTagColor } = useTagColor()

const { clearSession } = useSession()
const { userInfo } = storeToRefs(userStore)
const { familyList: storeFamilyList } = storeToRefs(familyStore)

// --- 本地 UI 狀態 ---
interface FamilyUI extends Family {
  isOpen: boolean
}

const localFamilyList = ref<FamilyUI[]>([])
const showCreateDialog = ref(false)
const showJoinDialog = ref(false)
const showEditFamilyDialog = ref(false)
const editingFamily = ref<Family | null>(null)
const showDeleteFamilyDialog = ref(false)
const deletingFamily = ref<Family | null>(null)
const isDeleting = ref(false)
const showQuitFamilyDialog = ref(false)
const quittingFamily = ref<Family | null>(null)
const isQuitting = ref(false)

// --- 資料同步 ---
watch(
  storeFamilyList,
  (newList) => {
    if (newList && Array.isArray(newList)) {
      const existingOpenStates = new Map(localFamilyList.value.map((f) => [f.id, f.isOpen]))
      localFamilyList.value = newList.map((f) => ({
        ...f,
        // 已存在的家庭保留原展開狀態；新加入的家庭預設展開
        isOpen: existingOpenStates.has(f.id) ? existingOpenStates.get(f.id)! : true,
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
  if (user.identities && Array.isArray(user.identities)) tags.push(...user.identities)
  return tags
})

const userAge = computed(() => {
  const birthday = userInfo.value?.birthday
  if (!birthday) return null
  const today = new Date()
  const birth = new Date(birthday)
  let age = today.getFullYear() - birth.getFullYear()
  const notReached =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  if (notReached) age--
  return age
})

const formattedBirthday = computed(() => {
  const birthday = userInfo.value?.birthday
  if (!birthday) return null
  const [y, m, d] = birthday.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
})

const formattedJoinDate = computed(() => {
  const date = userInfo.value?.createdAt
  if (!date) return null
  const d = new Date(date)
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
})

const toggleFamily = (id: string) => {
  const target = localFamilyList.value.find((f) => f.id === id)
  if (target) target.isOpen = !target.isOpen
}

const handleQuitFamily = (familyId: string) => {
  const targetFamily = familyStore.familyList.find(f => f.id === familyId)
  if (!targetFamily) return
  quittingFamily.value = targetFamily
  showQuitFamilyDialog.value = true
}

const confirmQuitFamily = async () => {
  const currentUserId = userStore.userInfo?.id
  if (!currentUserId || !quittingFamily.value) return

  const myMembership = quittingFamily.value.userFamilies?.find(m => m.userId === currentUserId)
  if (!myMembership) {
    ElMessage.error('找不到您的成員資料，無法退出')
    return
  }

  isQuitting.value = true
  try {
    await familyStore.removeMember(myMembership.id)
    await familyStore.loadFamilies()
    ElMessage.success('已成功退出家庭')
    showQuitFamilyDialog.value = false
  } catch {
    ElMessage.error('退出失敗，請稍後再試')
  } finally {
    isQuitting.value = false
  }
}

const handleFamilyCommand = (command: 'create' | 'join') => {
  if (command === 'create') {
    showCreateDialog.value = true
  } else if (command === 'join') {
    showJoinDialog.value = true
  }
}

const isAdminOf = (family: Family) => {
  const userId = userStore.userInfo?.id
  if (!userId) return false
  return family.userFamilies?.some(m => m.userId === userId && m.role === 'Admin') ?? false
}

const openEditFamilyDialog = (family: Family) => {
  editingFamily.value = family
  showEditFamilyDialog.value = true
}

const handleDeleteFamily = (family: Family) => {
  deletingFamily.value = family
  showDeleteFamilyDialog.value = true
}

const confirmDeleteFamily = async () => {
  if (!deletingFamily.value) return
  isDeleting.value = true
  try {
    await familyStore.removeFamily(deletingFamily.value.id)
    ElMessage.success('家庭已刪除')
    showDeleteFamilyDialog.value = false
  } catch (error) {
    console.error(error)
    ElMessage.error('刪除失敗，請稍後再試')
  } finally {
    isDeleting.value = false
  }
}

const handleMemberCommand = async (command: string, memberId: string, memberName: string) => {
  if (command === 'admin') {
    try {
      await familyStore.updateMemberRole(memberId, { role: 'Admin' })
      ElMessage.success(`已將 ${memberName} 設為管理員`)
    } catch {
      ElMessage.error('更新失敗，請稍後再試')
    }
  } else if (command === 'member') {
    try {
      await familyStore.updateMemberRole(memberId, { role: 'Member' })
      ElMessage.success(`已將 ${memberName} 設為一般成員`)
    } catch {
      ElMessage.error('更新失敗，請稍後再試')
    }
  } else if (command === 'remove') {
    try {
      await ElMessageBox.confirm(
        `確定要移除「${memberName}」嗎？`,
        '移除成員',
        {
          confirmButtonText: '確定移除',
          cancelButtonText: '取消',
          type: 'warning',
          confirmButtonClass: 'el-button--danger',
        },
      )
      await familyStore.removeMember(memberId)
      await familyStore.loadFamilies()
      ElMessage.success('已移除成員')
    } catch (error) {
      if (error !== 'cancel') {
        console.error(error)
        ElMessage.error('移除失敗，請稍後再試')
      }
    }
  }
}

const showJoinCodeDialog = ref(false)
const joinCodeValue = ref('')
const joinCodeQrDataUrl = ref('')
const joinCodeLoading = ref(false)

const joinCode = async (familyId: string) => {
  joinCodeLoading.value = true
  joinCodeValue.value = ''
  joinCodeQrDataUrl.value = ''
  showJoinCodeDialog.value = true

  try {
    const { code } = await generateJoinCode(familyId)
    joinCodeValue.value = code
    joinCodeQrDataUrl.value = await QRCode.toDataURL(code, {
      width: 200,
      margin: 2,
      color: { dark: '#3D6B20', light: '#ffffff' },
    })
  } catch {
    ElMessage.error('取得邀請碼失敗，請稍後再試')
    showJoinCodeDialog.value = false
  } finally {
    joinCodeLoading.value = false
  }
}

const goEditProfile = () => router.push('/profile/edit')
const goQuestions = () => router.push('/question')
const goFavorites = () => router.push('/favorites')
const goTerms = () => router.push('/terms')
const goPrivate = () => router.push('/private')

const handleLogout = async () => {
  await userStore.userLogout()
  clearSession()
}

// --- 帳號管理 ---
const showDeleteAccountDialog = ref(false)
const deletePassword = ref('')
const isDeletingAccount = ref(false)

const showUnlinkDialog = ref(false)
const unlinkTarget = ref<'line' | 'google' | null>(null)
const isUnlinking = ref(false)

const openUnlinkDialog = (provider: 'line' | 'google') => {
  unlinkTarget.value = provider
  showUnlinkDialog.value = true
}

const confirmUnlink = async () => {
  if (!unlinkTarget.value || !userInfo.value) return
  isUnlinking.value = true
  try {
    const payload: UpdateUserDto = unlinkTarget.value === 'line'
      ? { lineId: null }
      : { googleId: null }

    await userStore.userUpdateProfile(userInfo.value.id, payload)
    ElMessage.success(`已解除 ${unlinkTarget.value === 'line' ? 'LINE' : 'Google'} 綁定`)
    showUnlinkDialog.value = false
  } catch {
    ElMessage.error('解除綁定失敗，請稍後再試')
  } finally {
    isUnlinking.value = false
  }
}

const confirmDeleteAccount = async () => {
  isDeletingAccount.value = true
  try {
    await userStore.userDeleteAccount(deletePassword.value)
    ElMessage.success('帳號已刪除')
    clearSession()
  } catch {
    ElMessage.error('刪除失敗，請確認密碼是否正確')
  } finally {
    isDeletingAccount.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-white pb-10 font-sans text-gray-800">
    <div class="max-w-7xl mx-auto px-4 md:pt-10">
      <div class="bg-white md:rounded-3xl p-6 md:p-8 relative z-10 mb-8 border-b md:border border-gray-100">

        <!-- 頂部：頭像 + 名字 + 編輯 -->
        <div class="flex items-start gap-5">
          <div class="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gray-50 p-1 border border-gray-100 shrink-0 overflow-hidden">
            <img :src="userInfo?.avatarUrl || DEFAULT_AVATAR" class="w-full h-full rounded-full object-cover bg-white" />
          </div>

          <div class="flex-1 min-w-0 pt-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-2xl md:text-3xl font-bold text-gray-800 truncate">
                {{ getDisplayName(userInfo) }}
              </h1>
              <button @click="goEditProfile" class="text-gray-300 hover:text-gray-500 transition-colors shrink-0">
                <Icon icon="mingcute:edit-line" class="text-2xl" />
              </button>
            </div>

            <p class="text-sm text-gray-400 mt-0.5 truncate">{{ userInfo?.email }}</p>

            <!-- 綁定帳號徽章 -->
            <div v-if="userInfo?.lineId || userInfo?.googleId" class="flex items-center gap-2 mt-2">
              <span v-if="userInfo?.lineId"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#06C755]/10 text-[#06C755]">
                <Icon icon="mingcute:line-app-fill" class="text-sm" />LINE
              </span>
              <span v-if="userInfo?.googleId"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-500">
                <Icon icon="mingcute:google-fill" class="text-sm" />Google
              </span>
            </div>
          </div>
        </div>

        <!-- 基本資訊列 -->
        <div class="mt-5 flex flex-wrap gap-x-5 gap-y-2">
          <div v-if="userInfo?.city" class="flex items-center gap-1.5 text-sm text-gray-500">
            <Icon icon="mingcute:location-line" class="text-base text-gray-400 shrink-0" />
            <span>{{ userInfo.city }}</span>
          </div>
          <div v-if="formattedBirthday" class="flex items-center gap-1.5 text-sm text-gray-500">
            <Icon icon="mingcute:birthday-2-line" class="text-base text-gray-400 shrink-0" />
            <span>{{ formattedBirthday }}<span v-if="userAge !== null" class="ml-1 text-gray-400">（{{ userAge }} 歲）</span></span>
          </div>
          <div v-if="formattedJoinDate" class="flex items-center gap-1.5 text-sm text-gray-500">
            <Icon icon="mingcute:calendar-line" class="text-base text-gray-400 shrink-0" />
            <span>{{ formattedJoinDate }} 加入</span>
          </div>
        </div>

        <!-- 身分別 -->
        <div class="mt-5 flex flex-wrap items-center gap-2">
          <span class="text-sm font-bold text-gray-500 mr-1">身分別</span>
          <template v-if="currentUserTags.length > 0">
            <span v-for="tag in currentUserTags" :key="tag"
              class="px-3 py-1 rounded-lg text-white text-xs font-bold shadow-sm" :class="getTagColor(tag)">
              {{ tag }}
            </span>
          </template>
          <span v-else class="text-sm text-gray-400">尚未設定身分別</span>
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

      <!-- 家庭列表空狀態 -->
      <div v-if="localFamilyList.length === 0"
        class="mb-12 flex flex-col items-center justify-center gap-4 py-16 rounded-2xl border-2 border-dashed border-gray-100 text-center">
        <div class="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center">
          <Icon icon="mingcute:home-6-line" class="text-3xl text-gray-300" />
        </div>
        <div class="space-y-1">
          <p class="text-base font-bold text-gray-400">尚未加入任何家庭</p>
          <p class="text-sm text-gray-300">建立或加入家庭，一起管理福利資訊</p>
        </div>
        <div class="flex gap-3 mt-1">
          <button @click="showCreateDialog = true"
            class="px-5 py-2 rounded-full bg-[#84cc16] text-white text-sm font-bold hover:bg-green-500 transition-colors shadow-sm">
            建立家庭
          </button>
          <button @click="showJoinDialog = true"
            class="px-5 py-2 rounded-full border border-gray-200 text-gray-500 text-sm font-bold hover:bg-gray-50 transition-colors">
            加入家庭
          </button>
        </div>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <div v-for="family in localFamilyList" :key="family.id"
          class="bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 border border-gray-100 hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] transition-shadow duration-300">
          <div class="flex items-center justify-between cursor-pointer select-none" @click="toggleFamily(family.id)">
            <div class="flex items-center gap-2">
              <h3 class="text-xl font-bold text-gray-800">
                {{ family.name }} ( {{ family.userFamilies?.length || 0 }} )
              </h3>
              <button v-if="isAdminOf(family)" @click.stop="openEditFamilyDialog(family)"
                class="text-gray-300 hover:text-gray-500 transition-colors">
                <Icon icon="mingcute:edit-line" class="text-lg" />
              </button>
            </div>

            <div class="flex items-center gap-4 text-gray-400">
              <Icon @click.stop="joinCode(family.id)" icon="mingcute:grid-line"
                class="text-2xl hover:text-gray-600 cursor-pointer" />
              <Icon v-if="isAdminOf(family)" @click.stop="handleDeleteFamily(family)" icon="mingcute:delete-2-line"
                class="text-2xl hover:text-red-400 transition-colors" />
              <Icon icon="mingcute:down-line" class="text-2xl transition-transform duration-300"
                :class="{ 'rotate-180': family.isOpen }" />
            </div>
          </div>

          <div v-show="!family.isOpen" class="mt-4 flex items-center">
            <div class="flex -space-x-3 overflow-hidden p-1">
              <template v-if="family.userFamilies && family.userFamilies.length > 0">
                <img v-for="member in family.userFamilies.slice(0, 5)" :key="member.id"
                  :src="member.user?.avatarUrl || DEFAULT_AVATAR"
                  class="inline-block h-10 w-10 rounded-full ring-2 ring-white bg-gray-50 object-cover border border-gray-100" />
              </template>
              <span v-else class="text-sm text-gray-400 ml-2">暫無成員</span>
            </div>
          </div>

          <div v-show="family.isOpen" class="mt-6 space-y-6">
            <template v-if="family.userFamilies && family.userFamilies.length > 0">
              <div v-for="member in family.userFamilies" :key="member.id" class="flex items-start gap-4">
                <div class="w-12 h-12 rounded-full bg-gray-50 shrink-0 border border-gray-100 overflow-hidden">
                  <img :src="member.user?.avatarUrl || DEFAULT_AVATAR" class="w-full h-full object-cover" />
                </div>

                <div class="flex-1 min-w-0 pt-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-base font-bold text-gray-800 mr-1">
                      {{ getDisplayName(member.user) }}
                    </span>

                    <template v-if="member.user?.identities?.length">
                      <span v-for="tag in member.user.identities" :key="tag"
                        class="px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm"
                        :class="getTagColor(tag)">
                        {{ tag }}
                      </span>
                    </template>

                    <span v-if="member.user?.gender"
                      class="px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm"
                      :class="getTagColor(member.user.gender)">
                      {{ member.user.gender }}
                    </span>

                    <span v-if="!member.user?.identities?.length && !member.user?.gender" class="text-xs text-gray-400">
                      目前尚無設定身分別
                    </span>
                  </div>
                </div>

                <el-dropdown v-if="isAdminOf(family) && member.userId !== userInfo?.id" trigger="click"
                  placement="bottom-end"
                  @command="(cmd: string) => handleMemberCommand(cmd, member.id, getDisplayName(member.user))">
                  <button class="text-gray-300 hover:text-gray-500 outline-none" @click.stop>
                    <Icon icon="mingcute:more-2-fill" class="text-xl" />
                  </button>
                  <template #dropdown>
                    <el-dropdown-menu class="rounded-xl overflow-hidden p-1">
                      <el-dropdown-item v-if="member.role === 'Member'" command="admin">
                        <div class="flex items-center gap-2 py-0.5 px-1 text-gray-700">
                          <Icon icon="mingcute:crown-line" class="text-base text-yellow-500" />
                          <span>設為管理員</span>
                        </div>
                      </el-dropdown-item>
                      <el-dropdown-item v-if="member.role === 'Admin'" command="member">
                        <div class="flex items-center gap-2 py-0.5 px-1 text-gray-700">
                          <Icon icon="mingcute:user-2-line" class="text-base text-gray-400" />
                          <span>設為一般成員</span>
                        </div>
                      </el-dropdown-item>
                      <el-dropdown-item command="remove" divided>
                        <div class="flex items-center gap-2 py-0.5 px-1 text-red-500">
                          <Icon icon="mingcute:user-remove-line" class="text-base" />
                          <span>移除成員</span>
                        </div>
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </template>

            <div v-else class="text-gray-400 text-center py-4 text-sm">此家庭暫無其他成員</div>

            <div class="pt-2 flex justify-center">
              <button @click.stop="handleQuitFamily(family.id)"
                class="w-40 border border-[#84cc16] text-[#84cc16] font-bold py-2 rounded-full hover:bg-[#84cc16] hover:text-white transition-colors duration-300 text-sm shadow-sm">
                退出
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-4 mb-10">
        <h2 class="text-gray-800 font-bold text-lg px-2 md:px-0">其他</h2>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
          <button @click="goQuestions"
            class="w-full flex items-center gap-4 p-5 hover:bg-gray-50 transition text-left group">
            <Icon icon="mingcute:question-line"
              class="text-xl text-gray-800 group-hover:scale-110 transition-transform" />
            <span class="font-bold text-gray-800">常見問題</span>
          </button>

          <button @click="goFavorites"
            class="w-full flex items-center gap-4 p-5 hover:bg-gray-50 transition text-left group">
            <Icon icon="mdi:heart-outline" class="text-xl text-gray-800 group-hover:scale-110 transition-transform" />
            <span class="font-bold text-gray-800">已收藏之福利</span>
          </button>

          <button @click="goTerms"
            class="w-full flex items-center gap-4 p-5 hover:bg-gray-50 transition text-left group">
            <Icon icon="wordpress:post-terms"
              class="text-xl text-gray-800 group-hover:scale-110 transition-transform" />
            <span class="font-bold text-gray-800">應用程式服務條款</span>
          </button>

          <button @click="goPrivate"
            class="w-full flex items-center gap-4 p-5 hover:bg-gray-50 transition text-left group">
            <Icon icon="mingcute:lock-line" class="text-xl text-gray-800 group-hover:scale-110 transition-transform" />
            <span class="font-bold text-gray-800">隱私權政策</span>
          </button>

          <button @click="handleLogout"
            class="md:hidden w-full flex items-center gap-4 p-5 hover:bg-gray-50 transition text-left group">
            <Icon icon="mingcute:exit-line" class="text-xl text-red-500 group-hover:scale-110 transition-transform" />
            <span class="font-bold text-red-500">登出</span>
          </button>
        </div>
      </div>

      <!-- 帳號管理 -->
      <div class="space-y-4 mb-10">
        <h2 class="text-gray-800 font-bold text-lg px-2 md:px-0">帳號管理</h2>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">

          <button v-if="userInfo?.lineId" @click="openUnlinkDialog('line')"
            class="w-full flex items-center gap-4 p-5 hover:bg-gray-50 transition text-left group">
            <Icon icon="mingcute:line-app-fill"
              class="text-xl text-[#06C755] group-hover:scale-110 transition-transform" />
            <div class="flex-1">
              <span class="font-bold text-gray-800">解除 LINE 綁定</span>
              <p class="text-xs text-gray-400 mt-0.5">解除後將無法使用 LINE 登入</p>
            </div>
            <Icon icon="mingcute:right-line" class="text-gray-300" />
          </button>

          <button v-if="userInfo?.googleId" @click="openUnlinkDialog('google')"
            class="w-full flex items-center gap-4 p-5 hover:bg-gray-50 transition text-left group">
            <Icon icon="mingcute:google-fill"
              class="text-xl text-[#4285F4] group-hover:scale-110 transition-transform" />
            <div class="flex-1">
              <span class="font-bold text-gray-800">解除 Google 綁定</span>
              <p class="text-xs text-gray-400 mt-0.5">解除後將無法使用 Google 登入</p>
            </div>
            <Icon icon="mingcute:right-line" class="text-gray-300" />
          </button>

          <button @click="showDeleteAccountDialog = true"
            class="w-full flex items-center gap-4 p-5 hover:bg-red-50 transition text-left group">
            <Icon icon="mingcute:delete-2-line"
              class="text-xl text-red-400 group-hover:scale-110 transition-transform" />
            <div class="flex-1">
              <span class="font-bold text-red-500">刪除帳號</span>
              <p class="text-xs text-gray-400 mt-0.5">此操作無法復原，所有資料將永久刪除</p>
            </div>
            <Icon icon="mingcute:right-line" class="text-gray-300" />
          </button>

        </div>
      </div>
    </div>
  </div>
  <CreateFamilyDialog v-model="showCreateDialog" />
  <EditFamilyDialog v-model="showEditFamilyDialog" :family="editingFamily" />
  <JoinFamilyDialog v-model="showJoinDialog" />

  <el-dialog v-model="showDeleteFamilyDialog" title="刪除家庭" width="90%" class="max-w-sm rounded-xl" align-center>
    <p class="text-gray-700 text-sm leading-relaxed">
      確定要刪除「<span class="font-bold">{{ deletingFamily?.name }}</span>」嗎？<br />
      此操作無法復原，家庭內所有成員將被移除。
    </p>
    <template #footer>
      <div class="flex gap-3">
        <button @click="showDeleteFamilyDialog = false"
          class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 font-bold hover:bg-gray-50 transition">
          取消
        </button>
        <button @click="confirmDeleteFamily" :disabled="isDeleting"
          class="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
          <Icon v-if="isDeleting" icon="line-md:loading-loop" />
          確定刪除
        </button>
      </div>
    </template>
  </el-dialog>

  <el-dialog v-model="showQuitFamilyDialog" title="退出家庭" width="90%" class="max-w-sm rounded-xl" align-center>
    <p class="text-gray-700 text-sm leading-relaxed">
      確定要退出「<span class="font-bold">{{ quittingFamily?.name }}</span>」嗎？<br />
      退出後需重新受邀才能加入。
    </p>
    <template #footer>
      <div class="flex gap-3">
        <button @click="showQuitFamilyDialog = false"
          class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 font-bold hover:bg-gray-50 transition">
          取消
        </button>
        <button @click="confirmQuitFamily" :disabled="isQuitting"
          class="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
          <Icon v-if="isQuitting" icon="line-md:loading-loop" />
          確定退出
        </button>
      </div>
    </template>
  </el-dialog>

  <el-dialog v-model="showJoinCodeDialog" title="邀請加入家庭" width="90%" class="max-w-xs rounded-2xl" align-center>
    <div class="flex flex-col items-center gap-5 py-2">
      <div v-if="joinCodeLoading" class="py-10">
        <Icon icon="line-md:loading-loop" class="text-4xl text-mygreen" />
      </div>

      <template v-else>
        <img :src="joinCodeQrDataUrl" alt="邀請碼 QR Code" class="w-48 h-48 rounded-xl border border-gray-100 shadow-sm" />

        <div class="text-center space-y-1">
          <p class="text-xs text-gray-400">邀請碼</p>
          <p class="text-3xl font-mono font-bold tracking-[0.3em] text-gray-800">
            {{ joinCodeValue }}
          </p>
        </div>

        <p class="text-xs text-gray-400 text-center">
          請將邀請碼或 QR Code 分享給想加入的成員
        </p>
      </template>
    </div>

    <template #footer>
      <button @click="showJoinCodeDialog = false"
        class="w-full py-2.5 rounded-xl bg-mygreen text-white font-bold hover:bg-[#7dab00] transition">
        關閉
      </button>
    </template>
  </el-dialog>

  <!-- 解除綁定 Dialog -->
  <el-dialog v-model="showUnlinkDialog" :title="`解除 ${unlinkTarget === 'line' ? 'LINE' : 'Google'} 綁定`" width="90%"
    class="max-w-sm rounded-xl" align-center>
    <p class="text-gray-700 text-sm leading-relaxed">
      確定要解除 <span class="font-bold">{{ unlinkTarget === 'line' ? 'LINE' : 'Google' }}</span> 綁定嗎？<br />
      解除後將無法使用該帳號登入。
    </p>
    <template #footer>
      <div class="flex gap-3">
        <button @click="showUnlinkDialog = false"
          class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 font-bold hover:bg-gray-50 transition">
          取消
        </button>
        <button @click="confirmUnlink" :disabled="isUnlinking"
          class="flex-1 py-2.5 rounded-xl bg-orange-500 text-white font-bold hover:bg-orange-600 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
          <Icon v-if="isUnlinking" icon="line-md:loading-loop" />
          確定解除
        </button>
      </div>
    </template>
  </el-dialog>

  <!-- 刪除帳號 Dialog -->
  <el-dialog v-model="showDeleteAccountDialog" title="刪除帳號" width="90%" class="max-w-sm rounded-xl" align-center
    @closed="deletePassword = ''">
    <div class="space-y-4">
      <p class="text-gray-700 text-sm leading-relaxed">
        此操作 <span class="font-bold text-red-500">無法復原</span>，您的所有資料將永久刪除。<br />
        請輸入密碼以確認操作。
      </p>
      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <Icon icon="mingcute:lock-line" class="text-lg" />
        </span>
        <input v-model="deletePassword" type="password" placeholder="請輸入您的密碼"
          class="w-full pl-9 pr-3 py-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-red-400 transition-colors" />
      </div>
    </div>
    <template #footer>
      <div class="flex gap-3">
        <button @click="showDeleteAccountDialog = false"
          class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 font-bold hover:bg-gray-50 transition">
          取消
        </button>
        <button @click="confirmDeleteAccount" :disabled="isDeletingAccount || !deletePassword"
          class="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
          <Icon v-if="isDeletingAccount" icon="line-md:loading-loop" />
          確定刪除
        </button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped></style>
