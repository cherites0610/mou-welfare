export const CATEGORIES = [
  '兒童及青少年福利',
  '婦女與幼兒福利',
  '老人福利',
  '社會救助福利',
  '身心障礙福利',
  '其他福利',
] as const

export type Category = (typeof CATEGORIES)[number]
