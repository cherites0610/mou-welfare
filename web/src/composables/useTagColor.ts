// src/composables/useTagColor.ts
const tagColorMap: Record<string, string> = {
  '20歲以下': 'bg-myorange',
  '20歲-65歲': 'bg-myorange',
  '65歲以上': 'bg-myorange',
  '男性': 'bg-myblue',
  '女性': 'bg-myblue',
  '中低收入戶': 'bg-mypurple',
  '低收入戶': 'bg-mypurple',
  '榮民': 'bg-myblue-green',
  '身心障礙者': 'bg-myblue-green',
  '原住民': 'bg-myblue-green',
  '外籍配偶家庭': 'bg-myblue-green',
}

export function useTagColor() {
  
  const getTagColor = (tagName: string) => {
    return tagColorMap[tagName] || 'bg-gray-400'
  }
  return {
    tagColorMap,
    getTagColor
  }
}