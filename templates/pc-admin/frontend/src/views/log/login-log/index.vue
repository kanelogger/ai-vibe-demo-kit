<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { message } from "@/utils/message";
import {
  getLoginLog,
  getLoginLogs,
  type LoginLogItem,
  type LoginLogQuery
} from "@/api/system";

defineOptions({ name: "LogLoginLog" });

const loading = ref(false);
const detailVisible = ref(false);
const detail = ref<LoginLogItem | null>(null);
const rows = ref<LoginLogItem[]>([]);

const query = reactive<LoginLogQuery>({
  loginName: "",
  loginResult: "",
  startAt: "",
  endAt: "",
  page: 1,
  pageSize: 10
});

const pagination = reactive({ totalItems: 0 });

function resolveError(error: any, fallback: string) {
  return error?.response?.data?.error?.message ?? error?.error?.message ?? fallback;
}

function asLoginLog(row: unknown): LoginLogItem {
  return row as LoginLogItem;
}

async function loadRows() {
  loading.value = true;
  try {
    const res = await getLoginLogs(query);
    rows.value = res.data.items;
    pagination.totalItems = res.data.pagination.totalItems;
  } catch (error) {
    message(resolveError(error, "登录日志加载失败"), { type: "error" });
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  query.page = 1;
  loadRows();
}

async function openDetail(row: LoginLogItem) {
  try {
    const res = await getLoginLog(row.id);
    detail.value = res.data;
    detailVisible.value = true;
  } catch (error) {
    message(resolveError(error, "日志详情加载失败"), { type: "error" });
  }
}

onMounted(loadRows);
</script>

<template>
  <div class="log-page">
    <el-card shadow="never" class="search-panel">
      <el-form :model="query" inline label-width="72px">
        <el-form-item label="登录名">
          <el-input v-model="query.loginName" clearable placeholder="登录名" />
        </el-form-item>
        <el-form-item label="结果">
          <el-select v-model="query.loginResult" clearable placeholder="全部">
            <el-option label="失败" :value="0" />
            <el-option label="成功" :value="1" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-panel">
      <el-table v-loading="loading" :data="rows" row-key="id">
        <el-table-column prop="loginName" label="登录名" min-width="140" />
        <el-table-column prop="loginIp" label="IP" min-width="140" />
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="row.loginResult === 1 ? 'success' : 'danger'">
              {{ row.loginResult === 1 ? "成功" : "失败" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="failureReason" label="失败原因" min-width="180" />
        <el-table-column prop="loggedAt" label="登录时间" min-width="170" />
        <el-table-column label="操作" fixed="right" width="90">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(asLoginLog(row))">
              详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-row">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.totalItems"
          @size-change="loadRows"
          @current-change="loadRows"
        />
      </div>
    </el-card>

    <el-dialog v-model="detailVisible" title="登录日志详情" width="640px">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="登录名">{{ detail?.loginName }}</el-descriptions-item>
        <el-descriptions-item label="IP">{{ detail?.loginIp }}</el-descriptions-item>
        <el-descriptions-item label="结果">
          {{ detail?.loginResult === 1 ? "成功" : "失败" }}
        </el-descriptions-item>
        <el-descriptions-item label="失败原因">
          {{ detail?.failureReason ?? "-" }}
        </el-descriptions-item>
        <el-descriptions-item label="User Agent">
          {{ detail?.userAgent ?? "-" }}
        </el-descriptions-item>
        <el-descriptions-item label="登录时间">{{ detail?.loggedAt }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<style scoped>
.log-page {
  padding: 16px;
}

.search-panel,
.table-panel {
  border-radius: 6px;
}

.table-panel {
  margin-top: 16px;
}

.pagination-row {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
}
</style>
