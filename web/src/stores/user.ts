import { defineStore } from 'pinia'
import { ref } from 'vue'
import { login, register, updateProfile } from '../api/user'
import type { LoginDto, RegisterDto, UpdateUserDto, User } from '../api/user/model'

export const useUserStore = defineStore(
  'user',
  () => {
    const token = ref<string>('')
    const userInfo = ref<User | null>(null)

    const setToken = (newToken: string) => {
      token.value = newToken
    }

    const setUser = (user: User) => {
      userInfo.value = user
    }

    const clearState = () => {
      token.value = ''
      userInfo.value = null
    }

    const userLogin = async (loginForm: LoginDto) => {
      try {
        const res = await login(loginForm)
        setToken(res.access_token)
        setUser(res.user)
        return res
      } catch (error) {
        return Promise.reject(error)
      }
    }

    const userRegister = async (registerForm: RegisterDto) => {
      try {
        const res = await register(registerForm)
        setUser(res)
        return res
      } catch (error) {
        return Promise.reject(error)
      }
    }

    const userLogout = async () => {
      try {
        // await logout()
      } catch (error) {
        console.error(error)
      } finally {
        clearState()
      }
    }

    const userUpdateProfile = async (id: string, data: UpdateUserDto) => {
      try {
        const updatedUser = await updateProfile(id, data)
        setUser(updatedUser)
        return updatedUser
      } catch (error) {
        return Promise.reject(error)
      }
    }

    return {
      token,
      userInfo,
      userLogin,
      userRegister,
      userLogout,
      userUpdateProfile,
      setToken,
      setUser,
      clearState,
    }
  },
  {
    persist: {
      pick: ['token', 'userInfo'],
    },
  },
)
