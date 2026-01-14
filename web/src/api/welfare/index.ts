import request from '../../utils/request'
import type { SearchWelfareDto, WelfareListResponse } from './model'

enum Api {
  search = 'welfare'
}

export const getWelfares = (query: SearchWelfareDto) => {
  return request.get<WelfareListResponse>(Api.search, { params: query })
}
