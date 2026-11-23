<script setup lang="ts">
// @iconify/vue 的 Icon（不需要另外下載圖示檔）
import { Icon as Iconify } from '@iconify/vue'
defineProps<{ icon: string }>()
</script>

<template><Iconify :icon="icon" /></template>
