// 22 縣市（docs/scraper.md §4），福利資料的 city 欄位與使用者居住縣市共用。
export const CITIES = [
  '臺北市',
  '新北市',
  '桃園市',
  '臺中市',
  '臺南市',
  '高雄市',
  '基隆市',
  '新竹市',
  '嘉義市',
  '新竹縣',
  '苗栗縣',
  '彰化縣',
  '南投縣',
  '雲林縣',
  '嘉義縣',
  '屏東縣',
  '宜蘭縣',
  '花蓮縣',
  '臺東縣',
  '澎湖縣',
  '金門縣',
  '連江縣',
] as const

export type City = (typeof CITIES)[number]

/** 中央政府的全國性福利（福利資料的 city 欄位）：依縣市篩選時一併列出 */
export const NATIONAL = '全國'
