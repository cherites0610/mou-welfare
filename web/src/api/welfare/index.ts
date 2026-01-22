import request from '../../utils/request'
import type { SearchWelfareDto, WelfareListResponse } from './model'

enum Api {
  search = 'welfare'
}

export const getWelfares = (query: SearchWelfareDto) => {
  return request.post<WelfareListResponse>(Api.search, {
    ...query,
    identities: query.identities?.length ? query.identities : undefined,
    categories: query.categories?.length ? query.categories : undefined,
    cities: query.cities?.length ? query.cities : undefined
  })
}
