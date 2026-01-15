<script setup lang="ts">
import { useFamilyStore } from '../../stores/family'
import { useUserStore } from '../../stores/user'
import { useWelfareStore } from '../../stores/welfare'

const familyStore = useFamilyStore()
const userStroe = useUserStore()
const familys = familyStore.familyList
  const welfareStore = useWelfareStore()
  welfareStore.searchParams.familyId = undefined
  welfareStore.searchParams.userId = "738f60f7-aa96-470c-adc1-83717b84ade7"
  welfareStore.executeSearch()
  const welfares = welfareStore.welfares
</script>

<template>
  <pre>
    {{welfares[0]}}
  </pre>
</template>

<style scoped>
</style>
