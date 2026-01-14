import request from '@/utils/request'
import type { Welfare } from '../welfare/model'
import type { LoginDto, LoginResponse, RegisterDto, ResetPasswordDto, UpdateUserDto, User } from './model'

enum Api {
  Login = '/auth/login',
  Register = '/users/register',
  ResendVerification = '/users/resend-verification',
  ForgotPassword = '/users/forgot-password',
  ResetPassword = '/users/reset-password',
  Profile = '/users/profile',
  UpdateProfile = '/users/:id',
  Favorites = '/users/favorites',
  AddFavorite = '/users/favorites',
  RemoveFavorite = '/users/favorites/:welfareId',
}

export const login = (data: LoginDto) => {
  return request.post<LoginResponse>(Api.Login, data)
}

export const register = (data: RegisterDto) => {
  return request.post<User>(Api.Register, data)
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

export const getProfile = () => {
  return request.get<User>(Api.Profile)
}

export const updateProfile = (id: string, data: UpdateUserDto) => {
  return request.patch<User>(Api.UpdateProfile.replace(':id', id), data)
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
