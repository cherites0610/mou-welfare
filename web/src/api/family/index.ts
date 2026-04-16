import request from '@/utils/request'
import type {
  CreateFamilyDto,
  CreateUserFamilyDto,
  Family,
  JoinFamilyDto,
  UpdateFamilyDto,
  UpdateUserFamilyDto,
  UserFamily
} from './model'

enum Api {
  Base = '/families',
  Member = '/user-families',
  Join = '/families/join'
}

export const getFamilies = () => {
  return request.get<Family[]>(Api.Base)
}

export const getFamilyById = (id: string) => {
  return request.get<Family>(`${Api.Base}/${id}`)
}

export const createFamily = (data: CreateFamilyDto) => {
  return request.post<Family>(Api.Base, data)
}

export const updateFamily = (id: string, data: UpdateFamilyDto) => {
  return request.patch<Family>(`${Api.Base}/${id}`, data)
}

export const deleteFamily = (id: string) => {
  return request.delete<void>(`${Api.Base}/${id}`)
}

export const addFamilyMember = (data: CreateUserFamilyDto) => {
  return request.post<UserFamily>(Api.Member, data)
}

export const joinFamilyByCode = (data: JoinFamilyDto) => {
  return request.post<UserFamily>(`${Api.Member}/join`, data)
}

export const updateFamilyMemberRole = (id: string, data: UpdateUserFamilyDto) => {
  return request.patch<UserFamily>(`${Api.Member}/${id}`, data)
}

export const removeFamilyMember = (id: string) => {
  return request.delete<void>(`${Api.Member}/${id}`)
}

export const generateJoinCode = (id: string) => {
  return request.post<{ code: string }>(`${Api.Member}/invite-code`, { familyId: id })
}
