// 上傳圖片壓縮：依 EXIF 轉正 → 裁成正方形 → 轉 WebP → 移除所有中繼資料（含 GPS）。
// 以實際內容判斷格式，不相信 Content-Type 或副檔名。
import sharp, { type Metadata } from 'sharp'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const AVATAR_SIZE = 512
export const AVATAR_QUALITY = 80
const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'gif'])

export class ImageError extends Error {}

export async function processAvatar(input: Uint8Array) {
  let meta: Metadata
  try {
    // limitInputPixels 防止「解壓縮炸彈」（檔案小但像素極多的圖）
    meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata()
  } catch {
    throw new ImageError('無法辨識的圖片')
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) throw new ImageError(`不支援的格式：${meta.format ?? '未知'}`)

  const { data, info } = await sharp(input, { limitInputPixels: 40_000_000, animated: false })
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'attention', withoutEnlargement: false })
    .webp({ quality: AVATAR_QUALITY })
    .toBuffer({ resolveWithObject: true })
  return { data: new Uint8Array(data), width: info.width, height: info.height, contentType: 'image/webp' as const }
}
