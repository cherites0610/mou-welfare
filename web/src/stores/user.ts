import { defineStore } from 'pinia'
import { ref } from 'vue'
import { deleteAccount, login, loginWithLiff, loginWithOAuth, register, updateProfile } from '../api/user'
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
        if ('access_token' in res) {
          setToken(res.access_token)
          setUser(res.user)
        } else {
          setUser(res)
        }
        return res
      } catch (error) {
        return Promise.reject(error)
      }
    }

    const userLogout = async () => {
      // await logout()
    }

    const userLoginWithLiff = async (idToken: string) => {
      try {
        const liffResult = await loginWithLiff(idToken)
        if (liffResult.action === 'LOGIN') {
          const res = await loginWithOAuth(liffResult.code)
          setToken(res.access_token)
          setUser(res.user)
          return { action: 'LOGIN' as const }
        }
        return { action: 'REGISTER' as const, oauthCode: liffResult.code, email: liffResult.email }
      } catch (error) {
        return Promise.reject(error)
      }
    }

    const userLoginWithOAuth = async (code: string) => {
      try {
        const res = await loginWithOAuth(code)
        setToken(res.access_token)
        setUser(res.user)
        return res
      } catch (error) {
        return Promise.reject(error)
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

    const userDeleteAccount = async (password: string) => {
      const id = userInfo.value?.id
      if (!id) return Promise.reject(new Error('找不到使用者'))
      await deleteAccount(id, { password })
    }

    return {
      token,
      userInfo,
      userLogin,
      userLoginWithLiff,
      userLoginWithOAuth,
      userRegister,
      userLogout,
      userUpdateProfile,
      userDeleteAccount,
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
