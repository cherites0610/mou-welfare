import { useSession } from '@/composables/useSession'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import axios from 'axios'

class Request {
  private instance: AxiosInstance

  constructor(config: AxiosRequestConfig) {
    this.instance = axios.create(config)

    this.instance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const userJson = localStorage.getItem('user')
        const token = userJson ? JSON.parse(userJson).token : null

        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => {
        return Promise.reject(error)
      }
    )

    this.instance.interceptors.response.use(
      (response: AxiosResponse) => {
        if (response.status === 204) {
          return null
        }

        const { statusCode, data, message } = response.data

        if (statusCode === 200 || statusCode === 201) {
          return data
        } else {
          return Promise.reject(new Error(message || 'Error'))
        }
      },
      (error) => {
        if (error.response?.status === 401) {
          const url: string = error.config?.url ?? ''
          const isAuthEndpoint = url.startsWith('/auth/')
          if (!isAuthEndpoint) {
            useSession().clearSession()
          }
        }
        const errorMessage = error.response?.data?.error.message || error.message || 'Unknown Error'

        return Promise.reject(new Error(errorMessage))
      }
    )
  }

  request<T = any>(config: AxiosRequestConfig): Promise<T> {
    return this.instance.request<any, T>(config)
  }

  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.instance.get<any, T>(url, config)
  }

  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.instance.post<any, T>(url, data, config)
  }

  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.instance.put<any, T>(url, data, config)
  }

  patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.instance.patch<any, T>(url, data, config)
  }

  delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.instance.delete<any, T>(url, config)
  }
}

export default new Request({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
  // headers: { 'Content-Type': 'application/json;charset=utf-8' }
})
