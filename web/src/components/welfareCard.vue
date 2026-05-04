<script setup lang="ts">
import { addFavorite, removeFavorite } from '@/api/user'
import { useTagColor } from '@/composables/useTagColor'
import { isLiffEnvironment } from '@/utils/liff'
import { useUserStore } from '@/stores/user'
import { Icon } from '@iconify/vue'
import liff from '@line/liff'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { WelfareResponse } from '../api/welfare/model'

const router = useRouter()
const userStore = useUserStore()

const props = defineProps<{
  data: WelfareResponse
  favoritesWelfareIds: Set<string>
}>()

const emit = defineEmits<{
  (e: 'update-favorites'): void
}>()

const { getTagColor } = useTagColor()

const isCollected = computed(() => props.favoritesWelfareIds.has(props.data.id))
const loading = ref(false)

const statusColor = computed(() => {
  const light = props.data.match?.light || 'RED'
  switch (light) {
    case 'GREEN':
      return 'bg-mygreen'
    case 'YELLOW':
      return 'bg-myyellow'
    default:
      return 'bg-myred'
  }
})

const mainCategory = computed(() => {
  const cats = props.data.categories
  if (!cats || cats.length === 0) return '一般福利'
  return cats.join(' / ')
})

const visibleFamilyMatches = computed(() => {
  return props.data.familyMatches || []
})

const getMemberBorderColor = (light: string) => {
  switch (light) {
    case 'GREEN': return 'border-green-500 bg-green-50'
    case 'YELLOW': return 'border-yellow-400 bg-yellow-50'
    default: return 'border-red-400 bg-red-50'
  }
}

const share = async () => {
  const shareUrl = props.data.sourceUrl || window.location.href
  const title = props.data.name
  const city = props.data.sourceCity
  const categories = props.data.categories?.join(' / ') || '一般福利'
  const summary = props.data.summaryContent || ''

  if (isLiffEnvironment()) {
    try {
      await liff.shareTargetPicker([
        {
          type: 'flex',
          altText: title.slice(0, 400),
          contents: {
            type: 'bubble',
            hero: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '📋 福利資訊分享',
                  size: 'sm',
                  color: '#6B7280',
                  weight: 'bold'
                }
              ],
              paddingAll: '16px',
              backgroundColor: '#F9FAFB'
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: title,
                  weight: 'bold',
                  size: 'lg',
                  wrap: true,
                  color: '#111827'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: `${city}・${categories}`,
                      size: 'sm',
                      color: '#6B7280',
                      wrap: true,
                      flex: 1
                    }
                  ],
                  margin: 'md'
                },
                ...(summary
                  ? [
                    {
                      type: 'text' as const,
                      text: summary,
                      size: 'sm' as const,
                      color: '#374151',
                      wrap: true,
                      maxLines: 3,
                      margin: 'lg' as const
                    }
                  ]
                  : [])
              ]
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'button',
                  action: {
                    type: 'uri',
                    label: '查看詳情',
                    uri: shareUrl
                  },
                  style: 'primary',
                  color: '#10B981'
                }
              ],
              paddingAll: '12px'
            }
          } as any
        }
      ])
    } catch (e: any) {
      console.error(e)
      ElMessage.error('分享失敗，請稍後再試')
    }
    return
  }

  if (navigator.share) {
    try {
      await navigator.share({ title, text: `${city} ${categories}｜${title}`, url: shareUrl })
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') {
        ElMessage.error('分享失敗，請稍後再試')
      }
    }
    return
  }

  try {
    await navigator.clipboard.writeText(shareUrl)
    ElMessage.success('連結已複製到剪貼簿')
  } catch {
    ElMessage.error('複製失敗，請手動複製連結')
  }
}

const handleCollect = async () => {
  if (!userStore.token) {
    router.push({ name: 'Login', query: { redirect: `/welfares/${props.data.id}` } })
    return
  }
  if (loading.value) return
  loading.value = true
  try {
    if (isCollected.value) {
      await removeFavorite(props.data.id)
      ElMessage.success('已取消收藏')
    } else {
      await addFavorite(props.data.id)
      ElMessage.success('加入收藏成功！')
    }
    emit('update-favorites')
  } catch (error) {
    console.error(error)
    ElMessage.error('操作失敗，請稍後再試')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex w-full overflow-x-auto snap-x snap-mandatory no-scrollbar bg-white">
    <div
      class="w-full min-w-full snap-center group flex items-start md:items-center gap-4 pt-4 pb-4 px-4 transition-all duration-300 cursor-pointer hover:shadow-md">

      <div v-if="data.match?.light"
        class="w-4 h-4 rounded-full shrink-0 shadow-sm order-last md:order-first mt-5 md:mt-0" :class="statusColor">
      </div>

      <div class="flex-1 flex flex-col gap-2">
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-gray-500 text-sm tracking-wide">
            {{ data.sourceCity }}/{{ mainCategory }}
          </span>

          <div class="hidden md:flex flex-wrap gap-2">
            <span v-for="tag in data.identity" :key="tag"
              class="px-2.5 py-0.5 rounded text-white text-sm font-medium tracking-wide shadow-sm"
              :class="getTagColor(tag)">
              {{ tag }}
            </span>
          </div>
        </div>

        <h3 class="text-lg text-gray-800 font-bold leading-relaxed group-hover:text-mygreen transition-colors">
          {{ data.name }}
        </h3>

        <div v-if="visibleFamilyMatches.length > 0" class="flex items-center gap-2 mt-1">
          <span class="text-xs text-gray-400 shrink-0">家人適用：</span>
          <div class="flex flex-wrap -space-x-2">
            <div v-for="member in visibleFamilyMatches" :key="member.userId" class="relative group/avatar">
              <img :src="member.avatarUrl || 'https://storage.googleapis.com/mou-welfare/web/logo.png'" alt="Avatar"
                class="w-7 h-7 rounded-full border-2 object-cover bg-white shadow-sm transition-transform hover:scale-110 hover:z-10"
                :class="getMemberBorderColor(member.match?.light || 'RED')" />

              <div
                class="absolute -top-10 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded shadow-lg opacity-0 group-hover/avatar:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none flex flex-col items-center gap-0.5">
                <span class="font-bold">{{ member.name || '未知成員' }}</span>
                <span class="text-gray-200">{{ member.match?.score || 0 }}分</span>
                <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-black/80 rotate-45"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="hidden md:flex gap-3 ml-auto pl-2 border-gray-100">
        <Icon :icon="isCollected ? 'mdi:heart' : 'mdi:heart-outline'" class="text-2xl transition-colors mt-0.5"
          :class="isCollected ? 'text-red-500' : 'text-gray-400 hover:text-red-500'" @click.stop="handleCollect" />
        <Icon icon="uil:share" class="text-2xl text-gray-400 hover:text-mygreen transition-colors"
          @click.stop="share" />
      </div>
    </div>

    <div class="flex md:hidden snap-center">
      <div class="w-20 flex flex-col items-center justify-center transition-colors border-l border-gray-50"
        :class="isCollected ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500 active:bg-red-100 active:text-red-500'"
        @click.stop="handleCollect">
        <Icon :icon="isCollected ? 'mdi:heart' : 'mdi:heart-outline'" class="text-2xl mb-1" />
        <span class="text-xs">{{ isCollected ? '已收藏' : '收藏' }}</span>
      </div>

      <div
        class="w-20 bg-mygreen text-white flex flex-col items-center justify-center active:bg-green-700 transition-colors"
        @click.stop="share">
        <Icon icon="uil:share" class="text-2xl mb-1" />
        <span class="text-xs">分享</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
