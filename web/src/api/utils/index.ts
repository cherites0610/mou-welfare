import request from '../../utils/request'
import type { Faq } from './model'

enum Api {
  faq = 'faq',
  uploadImage = 'upload'
}

export const getFaqs = () => {
  return request.get<Faq[]>(Api.faq)
}

export const uploadImage = (file: File) => {
  const formData = new FormData()
  formData.append('file', file)

  return request.post<{ url: string }>(Api.uploadImage, formData)
}
