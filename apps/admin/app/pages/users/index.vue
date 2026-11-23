<script setup lang="ts">
const api = useApi()
const q = ref('')
const page = ref(1)
const limit = 30
const query = computed(() => ({ q: q.value.trim() || undefined, page: page.value, limit }))
const { data, status, error } = await useAsyncData('users', () => api<Paged<UserRow>>('/v1/admin/users', { query: query.value }), { watch: [query] })
watch(q, () => (page.value = 1))
const PROVIDER: Record<string, string> = { credential: 'Email', google: 'Google', line: 'LINE' }
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold">使用者</h1>
    <el-alert type="info" :closable="false" title="列表只顯示辨識用的欄位；點進詳情會看到生日、身分等個人資料，每次查看都會寫入稽核紀錄。" />
    <el-card shadow="never">
      <el-input v-model="q" placeholder="Email、名稱或 id" clearable class="!w-72" />
    </el-card>
    <el-alert v-if="error" :title="error.message" type="error" :closable="false" />
    <el-card shadow="never">
      <template #header>共 {{ data?.meta.total ?? 0 }} 位</template>
      <el-table v-loading="status === 'pending'" :data="data?.data ?? []" size="small" row-class-name="cursor-pointer" @row-click="(r: UserRow) => navigateTo(`/users/${r.id}`)">
        <el-table-column prop="name" label="名稱" />
        <el-table-column prop="email" label="Email" min-width="220" />
        <el-table-column label="驗證" width="70"><template #default="{ row }">{{ row.emailVerified ? '✓' : '' }}</template></el-table-column>
        <el-table-column label="登入方式" width="160"><template #default="{ row }">{{ row.providers.map((p: string) => PROVIDER[p] ?? p).join('、') }}</template></el-table-column>
        <el-table-column label="角色" width="80"><template #default="{ row }"><el-tag v-if="row.role === 'admin'" size="small" type="warning">管理者</el-tag></template></el-table-column>
        <el-table-column label="註冊" width="140"><template #default="{ row }">{{ fmtTime(row.createdAt) }}</template></el-table-column>
      </el-table>
      <el-pagination v-model:current-page="page" class="mt-4 justify-end" layout="total, prev, pager, next" :page-size="limit" :total="data?.meta.total ?? 0" />
    </el-card>
  </div>
</template>
