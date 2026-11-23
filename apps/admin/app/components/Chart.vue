<script setup lang="ts">
// ECharts（只載入用到的圖表類型）
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'

use([CanvasRenderer, BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent])
defineProps<{ option: Record<string, unknown>; height?: string }>()
</script>

<template>
  <VChart :option="option" autoresize :style="{ height: height ?? '300px' }" />
</template>
