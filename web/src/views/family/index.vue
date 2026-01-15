<script setup lang="ts">
import { useFamilyStore } from '../../stores/family'

const familyStore = useFamilyStore()
const familys = familyStore.familyList

familyStore.switchFamily(familys[0]!.id)
</script>

<template>
{{ familyStore.familyList }}
{{ familyStore.currentFamily }}
</template>

<style scoped>
</style>
