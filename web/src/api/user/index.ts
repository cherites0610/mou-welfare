import request from '@/utils/request'
import type { Welfare } from '../welfare/model'
import type { LoginDto, LoginResponse, RegisterDto, ResetPasswordDto, UpdateUserDto, User } from './model'

enum Api {
  Login = '/auth/login',
  LoginOAuth = '/auth/login-oauth',
  LoginLiff = '/auth/login-liff',
  Register = '/auth/register',
  ResendVerification = '/auth/resend-verification',
  ForgotPassword = '/auth/forgot-password',
  ResetPassword = '/auth/reset-password',

  LineLoginLink = '/auth/line-login',
  GoogleLoginLink = '/auth/google-login',

  Profile = '/users/profile',
  UpdateProfile = '/users/:id',
  DeleteAccount = '/users/:id',
  Favorites = '/users/favorites',
  AddFavorite = '/users/favorites',
  RemoveFavorite = '/users/favorites/:welfareId',
}

// --- Auth 相關 ---

export const login = (data: LoginDto) => {
  return request.post<LoginResponse>(Api.Login, data)
}

export const loginWithLiff = (lineAccessToken: string) => {
  return request.post<{ code: string; action: 'LOGIN' | 'REGISTER'; email: string }>(Api.LoginLiff, { accessToken: lineAccessToken })
}

export const loginWithOAuth = (code: string) => {
  return request.post<LoginResponse>(Api.LoginOAuth, { code })
}

export const register = (data: RegisterDto) => {
  return request.post<User | LoginResponse>(Api.Register, data)
}

export const resendVerification = (email: string) => {
  return request.post<{ message: string }>(Api.ResendVerification, { email })
}

export const forgotPassword = (email: string) => {
  return request.post<{ message: string }>(Api.ForgotPassword, { email })
}

export const resetPassword = (data: ResetPasswordDto) => {
  return request.post<{ message: string }>(Api.ResetPassword, data)
}

export const getLineLoginUrl = () => {
  return request.get<{ url: string }>(Api.LineLoginLink)
}

export const getGoogleLoginUrl = () => {
  return request.get<{ url: string }>(Api.GoogleLoginLink)
}

// --- User 相關 ---

export const getProfile = () => {
  return request.get<User>(Api.Profile)
}

export const updateProfile = (id: string, data: UpdateUserDto) => {
  return request.patch<User>(Api.UpdateProfile.replace(':id', id), data)
}

export const deleteAccount = (id: string, data: { password: string }) => {
  return request.delete<{ message: string }>(Api.DeleteAccount.replace(':id', id), { data })
}

export const addFavorite = (welfareId: string) => {
  return request.post<{ message: string }>(Api.AddFavorite, { welfareId })
}

export const removeFavorite = (welfareId: string) => {
  return request.delete<{ message: string }>(Api.RemoveFavorite.replace(':welfareId', welfareId))
}

export const getFavorites = () => {
  return request.get<Welfare[]>(Api.Favorites)
}
