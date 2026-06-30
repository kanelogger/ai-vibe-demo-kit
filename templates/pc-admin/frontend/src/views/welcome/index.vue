<script setup lang="ts">
import { onMounted, ref } from "vue";
import { message } from "@/utils/message";
import {
  getDashboardOverview,
  type DashboardOverview,
  type OperationLogSummary
} from "@/api/system";

defineOptions({ name: "Welcome" });

const loading = ref(false);
const overview = ref<DashboardOverview | null>(null);

function resolveError(error: any, fallback: string) {
  return error?.response?.data?.error?.message ?? error?.error?.message ?? fallback;
}

function messageTypeText(type: string) {
  const map: Record<string, string> = {
    NOTICE: "通知",
    ANNOUNCEMENT: "公告"
  };
  return map[type] ?? type;
}

function operationText(item: OperationLogSummary) {
  return `${item.moduleCode} / ${item.operationType}`;
}

async function loadOverview() {
  loading.value = true;
  try {
    const res = await getDashboardOverview();
    overview.value = res.data;
  } catch (error) {
    message(resolveError(error, "首页数据加载失败"), { type: "error" });
  } finally {
    loading.value = false;
  }
}

onMounted(loadOverview);
</script>

<template>
  <div class="dashboard-page" v-loading="loading">
    <div class="metric-grid">
      <el-card shadow="never" class="metric-card">
        <div class="metric-label">未读消息</div>
        <div class="metric-value">{{ overview?.unreadMessageCount ?? 0 }}</div>
      </el-card>
      <el-card shadow="never" class="metric-card">
        <div class="metric-label">我的待办</div>
        <div class="metric-value">{{ overview?.todoCount ?? 0 }}</div>
      </el-card>
      <el-card shadow="never" class="metric-card">
        <div class="metric-label">今日登录</div>
        <div class="metric-value">{{ overview?.adminStats?.todayLoginCount ?? "-" }}</div>
      </el-card>
      <el-card shadow="never" class="metric-card">
        <div class="metric-label">今日异常</div>
        <div class="metric-value">{{ overview?.adminStats?.apiErrorCount ?? "-" }}</div>
      </el-card>
    </div>

    <div v-if="overview?.adminStats" class="admin-grid">
      <el-card shadow="never" class="metric-card compact">
        <div class="metric-label">用户数</div>
        <div class="metric-value">{{ overview.adminStats.userCount }}</div>
      </el-card>
      <el-card shadow="never" class="metric-card compact">
        <div class="metric-label">角色数</div>
        <div class="metric-value">{{ overview.adminStats.roleCount }}</div>
      </el-card>
      <el-card shadow="never" class="metric-card compact">
        <div class="metric-label">菜单数</div>
        <div class="metric-value">{{ overview.adminStats.menuCount }}</div>
      </el-card>
    </div>

    <div class="content-grid">
      <el-card shadow="never" class="list-card">
        <template #header>
          <span>系统公告</span>
        </template>
        <el-empty
          v-if="!overview?.announcements.length"
          description="暂无公告"
          :image-size="72"
        />
        <div
          v-for="item in overview?.announcements ?? []"
          :key="item.id"
          class="list-item"
        >
          <div class="list-title">{{ item.title }}</div>
          <div class="list-meta">
            <span>{{ messageTypeText(item.messageType) }}</span>
            <span>{{ item.sentAt }}</span>
          </div>
          <div class="list-desc">{{ item.summary }}</div>
        </div>
      </el-card>

      <el-card shadow="never" class="list-card">
        <template #header>
          <span>最近操作</span>
        </template>
        <el-empty
          v-if="!overview?.recentOperations.length"
          description="暂无操作记录"
          :image-size="72"
        />
        <div
          v-for="item in overview?.recentOperations ?? []"
          :key="item.id"
          class="list-item"
        >
          <div class="list-title">{{ operationText(item) }}</div>
          <div class="list-meta">
            <span>{{ item.operatorName ?? "系统" }}</span>
            <span>{{ item.operatedAt }}</span>
          </div>
          <el-tag :type="item.operationResult === 1 ? 'success' : 'danger'" size="small">
            {{ item.operationResult === 1 ? "成功" : "失败" }}
          </el-tag>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page {
  padding: 16px;
}

.metric-grid,
.admin-grid,
.content-grid {
  display: grid;
  gap: 16px;
}

.metric-grid {
  grid-template-columns: repeat(4, minmax(160px, 1fr));
}

.admin-grid {
  grid-template-columns: repeat(3, minmax(160px, 1fr));
  margin-top: 16px;
}

.content-grid {
  grid-template-columns: repeat(2, minmax(320px, 1fr));
  margin-top: 16px;
}

.metric-card,
.list-card {
  border-radius: 6px;
}

.metric-card.compact {
  min-height: 92px;
}

.metric-label {
  color: var(--el-text-color-secondary);
}

.metric-value {
  margin-top: 8px;
  font-size: 28px;
  font-weight: 600;
}

.list-item {
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.list-item:last-child {
  border-bottom: 0;
}

.list-title {
  font-weight: 600;
}

.list-meta {
  display: flex;
  gap: 12px;
  margin: 6px 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.list-desc {
  color: var(--el-text-color-regular);
}
</style>
