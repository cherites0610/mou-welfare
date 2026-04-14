import {
  createFamily,
  deleteFamily as deleteFamilyApi,
  getFamilies,
  getFamilyById,
  joinFamilyByCode,
  removeFamilyMember,
  updateFamily as updateFamilyApi,
  updateFamilyMemberRole
} from '@/api/family'
import type {
  CreateFamilyDto,
  Family,
  JoinFamilyDto,
  UpdateFamilyDto,
  UpdateUserFamilyDto
} from '@/api/family/model'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useFamilyStore = defineStore(
  'family',
  () => {
    const familyList = ref<Family[]>([])
    const currentFamily = ref<Family | null>(null)
    const loading = ref(false)

    const hasFamily = computed(() => familyList.value.length > 0)

    const getCurrentUserRole = (userId: string) => {
      if (!currentFamily.value?.userFamilies) return null
      const member = currentFamily.value.userFamilies.find(m => m.userId === userId)
      return member?.role || null
    }

    const loadFamilies = async () => {
      loading.value = true
      try {
        const list = await getFamilies()
        familyList.value = list

        if (list.length === 0) {
          currentFamily.value = null
          return
        }

        const isCurrentStillValid = currentFamily.value && list.some(f => f.id === currentFamily.value?.id)

        if (!isCurrentStillValid) {
          currentFamily.value = list[0] || null
        }
      } catch (error) {
        console.error(error)
      } finally {
        loading.value = false
      }
    }

    const switchFamily = async (familyId: string) => {
      const target = familyList.value.find(f => f.id === familyId)
      if (target) {
        try {
          const detail = await getFamilyById(familyId)
          currentFamily.value = detail
        } catch (e) {
          console.error(e)
          currentFamily.value = target
        }
      }
    }

    const createNewFamily = async (data: CreateFamilyDto) => {
      try {
        const newFamily = await createFamily(data)
        familyList.value.push(newFamily)
        currentFamily.value = newFamily
        return newFamily
      } catch (error) {
        return Promise.reject(error)
      }
    }

    const joinViaCode = async (data: JoinFamilyDto) => {
      try {
        await joinFamilyByCode(data)
        await loadFamilies()
      } catch (error) {
        return Promise.reject(error)
      }
    }

    const removeMember = async (memberId: string) => {
      try {
        await removeFamilyMember(memberId)
        if (currentFamily.value && currentFamily.value.userFamilies) {
          currentFamily.value.userFamilies = currentFamily.value.userFamilies.filter(m => m.id !== memberId)
        }
      } catch (error) {
        return Promise.reject(error)
      }
    }

    const renameFamily = async (familyId: string, data: UpdateFamilyDto) => {
      try {
        await updateFamilyApi(familyId, data)
        if (data.name) {
          const index = familyList.value.findIndex(f => f.id === familyId)
          if (index !== -1) {
            familyList.value[index]!.name = data.name
          }
          if (currentFamily.value?.id === familyId) {
            currentFamily.value.name = data.name
          }
        }
      } catch (error) {
        return Promise.reject(error)
      }
    }

    const removeFamily = async (familyId: string) => {
      try {
        await deleteFamilyApi(familyId)
        familyList.value = familyList.value.filter(f => f.id !== familyId)
        if (currentFamily.value?.id === familyId) {
          currentFamily.value = familyList.value[0] ?? null
        }
      } catch (error) {
        return Promise.reject(error)
      }
    }

    const updateMemberRole = async (memberId: string, data: UpdateUserFamilyDto) => {
      try {
        const updatedMember = await updateFamilyMemberRole(memberId, data)
        if (currentFamily.value && currentFamily.value.userFamilies) {
          const index = currentFamily.value.userFamilies.findIndex(m => m.id === memberId)
          if (index !== -1) {
            Object.assign(currentFamily.value.userFamilies[index]!, updatedMember)
          }
        }
      } catch (error) {
        return Promise.reject(error)
      }
    }

    const clearState = () => {
      familyList.value = []
      currentFamily.value = null
    }

    return {
      familyList,
      currentFamily,
      loading,
      hasFamily,
      getCurrentUserRole,
      loadFamilies,
      switchFamily,
      createNewFamily,
      joinViaCode,
      renameFamily,
      removeFamily,
      removeMember,
      updateMemberRole,
      clearState
    }
  },
  {
    persist: {
      pick: ['familyList', 'currentFamily'],
      storage: localStorage
    }
  }
)
