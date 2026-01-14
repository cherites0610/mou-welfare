export interface ApiResponse<T = any> {
  statusCode: number
  data: T
  message: string
}

export interface ApiError {
  statusCode: number
  message: string,
  error: string
}
