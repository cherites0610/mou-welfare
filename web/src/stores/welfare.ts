import { getWelfares } from '@/api/welfare'
import type { SearchWelfareDto, WelfareResponse } from '@/api/welfare/model'
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

export const useWelfareStore = defineStore(
  'welfare',
  () => {
    const welfares = ref<WelfareResponse[]>([])
    const currentWelfare = ref<WelfareResponse | null>(null)
    const total = ref(0)
    const loading = ref(false)

    const searchParams = reactive<SearchWelfareDto>({
      page: 1,
      limit: 10,
      keywords: '',
      city: undefined,
      category: undefined,
      identities: [],
      userId: undefined,
      familyId: undefined
    })

    const executeSearch = async () => {
      loading.value = true
      try {
        const res = await getWelfares(searchParams)
        welfares.value = res.data
        total.value = res.total
        return res
      } catch (error) {
        return Promise.reject(error)
      } finally {
        loading.value = false
      }
    }

    const setCurrentWelfare = (welfare: WelfareResponse) => {
      currentWelfare.value = welfare
    }

    const hasCurrentWelfare = () => {
      return !!currentWelfare.value
    }

    const updateParams = (params: Partial<SearchWelfareDto>) => {
      Object.assign(searchParams, params)
      if (params.page === undefined) {
        searchParams.page = 1
      }
      return executeSearch()
    }

    const setPage = (page: number) => {
      searchParams.page = page
      return executeSearch()
    }

    const resetSearch = () => {
      searchParams.page = 1
      searchParams.keywords = ''
      searchParams.city = undefined
      searchParams.category = undefined
      searchParams.familyId = undefined
      return executeSearch()
    }

    const clearState = () => {
      welfares.value = []
      total.value = 0
      currentWelfare.value = null
    }

    return {
      welfares,
      currentWelfare,
      total,
      loading,
      searchParams,
      executeSearch,
      setCurrentWelfare,
      hasCurrentWelfare,
      updateParams,
      setPage,
      resetSearch,
      clearState
    }
  },
  {
    persist: {
      pick: ['searchParams', 'welfares', 'total', 'currentWelfare'],
      storage: localStorage
    }
  }
)
