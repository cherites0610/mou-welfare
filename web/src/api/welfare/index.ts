import request from '../../utils/request'
import type { SearchWelfareDto, WelfareResponse } from './model'

enum Api {
  search = 'welfare'
}

export const getWelfares = (query: SearchWelfareDto) => {
  return request.get<WelfareResponse>(Api.search, { params: query })
}
