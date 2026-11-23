<script setup lang="ts">
defineProps<{ label: string; value: string | number; hint?: string }>()
</script>

<template>
  <el-card shadow="never">
    <div class="text-xs text-gray-500">{{ label }}</div>
    <div class="text-2xl font-bold mt-1">{{ value }}</div>
    <div v-if="hint" class="text-xs text-gray-400 mt-1">{{ hint }}</div>
  </el-card>
</template>
