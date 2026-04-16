import liff from '@line/liff'

export const initLiff = () =>
  liff.init({ liffId: import.meta.env.VITE_LIFF_ID })

export const isLiffEnvironment = () => liff.isInClient()
export const isLiffLoggedIn = () => liff.isLoggedIn()
export const liffLogin = () => liff.login()
export const getLiffAccessToken = (): string => liff.getAccessToken()!
export const getLiffIdToken = (): string => liff.getIDToken()!
export const getLiffProfile = () => liff.getProfile()
