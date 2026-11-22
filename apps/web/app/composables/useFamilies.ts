// 家庭列表與操作（取代 v1 的 stores/family.ts）。API：apps/api/src/features/family/routes.ts
export type FamilyRole = 'admin' | 'member'

export type FamilyMember = {
  userId: string
  name: string
  image: string | null
  gender: string | null
  identities: string[]
  role: FamilyRole
  joinedAt: string
}

export type Family = { id: string; name: string; myRole: FamilyRole; members: FamilyMember[]; createdAt: string }

export function useFamilies() {
  const families = useState<Family[]>('families', () => [])
  const api = useApi()

  const load = async () => {
    families.value = (await api<{ data: Family[] }>('/v1/families')).data
    return families.value
  }

  return {
    families,
    load,
    create: async (name: string) => {
      await api('/v1/families', { method: 'POST', body: { name } })
      await load()
    },
    rename: async (id: string, name: string) => {
      await api(`/v1/families/${id}`, { method: 'PATCH', body: { name } })
      await load()
    },
    remove: async (id: string) => {
      await api(`/v1/families/${id}`, { method: 'DELETE' })
      await load()
    },
    setRole: async (id: string, userId: string, role: FamilyRole) => {
      await api(`/v1/families/${id}/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body: { role } })
      await load()
    },
    removeMember: async (id: string, userId: string) => {
      await api(`/v1/families/${id}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })
      await load()
    },
    invite: async (id: string) =>
      (await api<{ data: { code: string; expiresAt: string } }>(`/v1/families/${id}/invites`, { method: 'POST' })).data,
    join: async (code: string) => {
      await api(`/v1/invites/${encodeURIComponent(code)}/accept`, { method: 'POST' })
      await load()
    },
  }
}
