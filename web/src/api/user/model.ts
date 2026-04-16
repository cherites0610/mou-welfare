export interface User {
  id: string
  email: string
  name: string | null
  birthday: string | null
  gender: string | null
  isVerified: boolean
  isSubscribed: boolean
  lineId: string | null
  googleId: string | null
  avatarUrl: string | null
  city: string | null
  identities: string[]
  createdAt: string
  updatedAt: string
}

export interface LoginDto {
  email: string
  password: string
}

export interface LoginResponse {
  access_token: string
  user: User
}

export interface RegisterDto {
  email: string
  password: string
  name?: string
  verificationCode?: string
  oauthCode?: string
  birthday?: string
  gender?: string
  isSubscribed?: boolean
  lineId?: string
  googleId?: string
  avatarUrl?: string
  city?: string
  identities?: string[]
}

export interface ResetPasswordDto {
  email: string
  verificationCode: string
  newPassword: string
}

export type UpdateUserDto = Partial<
  Omit<
    RegisterDto,
    'email' | 'password' | 'verificationCode' | 'oauthCode' | 'lineId' | 'googleId'
  >
> & {
  lineId?: string | null
  googleId?: string | null
}
