import type { User } from '../user/model'

export interface UserFamily {
  id: string
  role: string
  userId: string
  familyId: string
  user?: User
  family?: Family
  createdAt: string
  updatedAt: string
}

export interface Family {
  id: string
  name: string
  userFamilies?: UserFamily[]
  createdAt: string
  updatedAt: string
}

export interface CreateFamilyDto {
  name: string
}

export type UpdateFamilyDto = Partial<CreateFamilyDto>

export interface CreateUserFamilyDto {
  familyId: string
  userId: string
  role: string
}

export interface JoinFamilyDto {
  code: string
}

export interface UpdateUserFamilyDto {
  role: string
}
