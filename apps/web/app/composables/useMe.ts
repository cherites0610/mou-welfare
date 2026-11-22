// 目前登入者的個人資料（GET /v1/me）。session 裡的資料在 PATCH 後不會自動更新，所以個人頁面以這裡為準。
export type Me = {
  id: string
  name: string
  email: string
  image: string | null
  birthday: string | null
  gender: string | null
  city: string | null
  identities: string[]
  isSubscribed: boolean
  createdAt: string
}

export function useMe() {
  const me = useState<Me | null>('me', () => null)
  const api = useApi()
  const refresh = async () => {
    me.value = (await api<{ data: Me }>('/v1/me')).data
    return me.value
  }
  return { me, refresh }
}
