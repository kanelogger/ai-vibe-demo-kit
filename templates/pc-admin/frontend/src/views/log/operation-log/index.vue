<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { message } from "@/utils/message";
import {
  getOperationLog,
  getOperationLogs,
  type OperationLogItem,
  type OperationLogQuery
} from "@/api/system";

defineOptions({ name: "LogOperationLog" });

const loading = ref(false);
const detailVisible = ref(false);
const detail = ref<OperationLogItem | null>(null);
const rows = ref<OperationLogItem[]>([]);

const query = reactive<OperationLogQuery>({
  operatorName: "",
  moduleCode: "",
  operationType: "",
  operationResult: "",
  startAt: "",
  endAt: "",
  page: 1,
  pageSize: 10
});

const pagination = reactive({ totalItems: 0 });

function resolveError(error: any, fallback: string) {
  return error?.response?.data?.error?.message ?? error?.error?.message ?? fallback;
}

function asOperationLog(row: unknown): OperationLogItem {
  return row as OperationLogItem;
}

async function loadRows() {
  loading.value = true;
  try {
    const res = await getOperationLogs(query);
    rows.value = res.data.items;
    pagination.totalItems = res.data.pagination.totalItems;
  } catch (error) {
    message(resolveError(error, "操作日志加载失败"), { type: "error" });
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  query.page = 1;
  loadRows();
}

async function openDetail(row: OperationLogItem) {
  try {
    const res = await getOperationLog(row.id);
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
        <el-form-item label="操作人">
          <el-input v-model="query.operatorName" clearable placeholder="操作人" />
        </el-form-item>
        <el-form-item label="模块">
          <el-input v-model="query.moduleCode" clearable placeholder="模块编码" />
        </el-form-item>
        <el-form-item label="类型">
          <el-input v-model="query.operationType" clearable placeholder="操作类型" />
        </el-form-item>
        <el-form-item label="结果">
          <el-select v-model="query.operationResult" clearable placeholder="全部">
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
        <el-table-column prop="operatorName" label="操作人" min-width="120" />
        <el-table-column prop="moduleCode" label="模块" min-width="130" />
        <el-table-column prop="operationType" label="类型" min-width="130" />
        <el-table-column prop="requestMethod" label="方法" width="90" />
        <el-table-column prop="requestPath" label="路径" min-width="220" show-overflow-tooltip />
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="row.operationResult === 1 ? 'success' : 'danger'">
              {{ row.operationResult === 1 ? "成功" : "失败" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="operatedAt" label="操作时间" min-width="170" />
        <el-table-column label="操作" fixed="right" width="90">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(asOperationLog(row))">
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

    <el-dialog v-model="detailVisible" title="操作日志详情" width="760px">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="操作人">{{ detail?.operatorName }}</el-descriptions-item>
        <el-descriptions-item label="模块">{{ detail?.moduleCode }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ detail?.operationType }}</el-descriptions-item>
        <el-descriptions-item label="请求">
          {{ detail?.requestMethod }} {{ detail?.requestPath }}
        </el-descriptions-item>
        <el-descriptions-item label="结果">
          {{ detail?.operationResult === 1 ? "成功" : "失败" }}
        </el-descriptions-item>
        <el-descriptions-item label="请求参数">
          <pre class="detail-pre">{{ detail?.requestParams ?? "-" }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="错误信息">
          {{ detail?.errorMessage ?? "-" }}
        </el-descriptions-item>
        <el-descriptions-item label="操作时间">{{ detail?.operatedAt }}</el-descriptions-item>
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

.detail-pre {
  max-height: 220px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
}
</style>
