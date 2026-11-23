<script setup lang="ts">
const api = useApi()
const route = useRoute()
const { data, error } = await useAsyncData(`user-${route.params.id}`, () => api<{ data: UserDetail }>(`/v1/admin/users/${route.params.id}`).then((r) => r.data))
const PROVIDER: Record<string, string> = { credential: 'Email 密碼', google: 'Google', line: 'LINE' }
</script>

<template>
  <div class="space-y-4">
    <el-button @click="navigateTo('/users')">← 返回列表</el-button>
    <el-alert v-if="error" :title="error.message" type="error" :closable="false" />
    <template v-if="data">
      <el-alert type="warning" :closable="false" title="這次查看已寫入稽核紀錄。個人資料僅限處理客服與系統問題使用。" />
      <el-card shadow="never">
        <div class="flex items-center gap-3 mb-4">
          <el-avatar :src="data.image ?? undefined" :size="48">{{ data.name.slice(0, 1) }}</el-avatar>
          <div>
            <div class="font-bold text-lg">{{ data.name }} <el-tag v-if="data.role === 'admin'" size="small" type="warning">管理者</el-tag></div>
            <div class="text-sm text-gray-500">{{ data.email }} {{ data.emailVerified ? '（已驗證）' : '（未驗證）' }}</div>
          </div>
        </div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="id"><code>{{ data.id }}</code></el-descriptions-item>
          <el-descriptions-item label="生日">{{ data.birthday ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="性別">{{ data.gender ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="居住縣市">{{ data.city ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="身分">{{ data.identities.join('、') || '—' }}</el-descriptions-item>
          <el-descriptions-item label="訂閱通知">{{ data.isSubscribed ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="登入方式">{{ data.providers.map((p) => PROVIDER[p.providerId] ?? p.providerId).join('、') }}</el-descriptions-item>
          <el-descriptions-item label="收藏">{{ data.favorites }} 筆</el-descriptions-item>
          <el-descriptions-item label="有效登入">{{ data.activeSessions }} 個（最近活動 {{ fmtTime(data.lastActiveAt) }}）</el-descriptions-item>
          <el-descriptions-item label="註冊／更新">{{ fmtTime(data.createdAt) }} ／ {{ fmtTime(data.updatedAt) }}</el-descriptions-item>
        </el-descriptions>
      </el-card>
      <el-card shadow="never" header="家庭">
        <el-table :data="data.families" size="small" empty-text="沒有加入家庭">
          <el-table-column prop="name" label="名稱" />
          <el-table-column label="角色" width="100"><template #default="{ row }">{{ row.role === 'admin' ? '管理者' : '成員' }}</template></el-table-column>
          <el-table-column prop="memberCount" label="人數" width="80" align="right" />
          <el-table-column label="加入" width="140"><template #default="{ row }">{{ fmtTime(row.joinedAt) }}</template></el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>
