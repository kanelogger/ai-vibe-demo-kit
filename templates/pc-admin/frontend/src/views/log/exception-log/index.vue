<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { message } from "@/utils/message";
import {
  getExceptionLog,
  getExceptionLogs,
  type ExceptionLogItem,
  type ExceptionLogQuery
} from "@/api/system";

defineOptions({ name: "LogExceptionLog" });

const loading = ref(false);
const detailVisible = ref(false);
const detail = ref<ExceptionLogItem | null>(null);
const rows = ref<ExceptionLogItem[]>([]);

const query = reactive<ExceptionLogQuery>({
  requestPath: "",
  errorType: "",
  handledStatus: "",
  startAt: "",
  endAt: "",
  page: 1,
  pageSize: 10
});

const pagination = reactive({ totalItems: 0 });

function resolveError(error: any, fallback: string) {
  return error?.response?.data?.error?.message ?? error?.error?.message ?? fallback;
}

function asExceptionLog(row: unknown): ExceptionLogItem {
  return row as ExceptionLogItem;
}

async function loadRows() {
  loading.value = true;
  try {
    const res = await getExceptionLogs(query);
    rows.value = res.data.items;
    pagination.totalItems = res.data.pagination.totalItems;
  } catch (error) {
    message(resolveError(error, "异常日志加载失败"), { type: "error" });
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  query.page = 1;
  loadRows();
}

async function openDetail(row: ExceptionLogItem) {
  try {
    const res = await getExceptionLog(row.id);
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
        <el-form-item label="路径">
          <el-input v-model="query.requestPath" clearable placeholder="请求路径" />
        </el-form-item>
        <el-form-item label="类型">
          <el-input v-model="query.errorType" clearable placeholder="异常类型" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.handledStatus" clearable placeholder="全部">
            <el-option label="未处理" :value="0" />
            <el-option label="已处理" :value="1" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-panel">
      <el-table v-loading="loading" :data="rows" row-key="id">
        <el-table-column prop="requestPath" label="路径" min-width="220" show-overflow-tooltip />
        <el-table-column prop="requestMethod" label="方法" width="90" />
        <el-table-column prop="errorType" label="异常类型" min-width="160" />
        <el-table-column prop="errorMessage" label="异常信息" min-width="260" show-overflow-tooltip />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.handledStatus === 1 ? 'success' : 'warning'">
              {{ row.handledStatus === 1 ? "已处理" : "未处理" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="occurredAt" label="发生时间" min-width="170" />
        <el-table-column label="操作" fixed="right" width="90">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(asExceptionLog(row))">
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

    <el-dialog v-model="detailVisible" title="异常日志详情" width="820px">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="请求">
          {{ detail?.requestMethod }} {{ detail?.requestPath }}
        </el-descriptions-item>
        <el-descriptions-item label="异常类型">{{ detail?.errorType }}</el-descriptions-item>
        <el-descriptions-item label="异常信息">{{ detail?.errorMessage }}</el-descriptions-item>
        <el-descriptions-item label="处理状态">
          {{ detail?.handledStatus === 1 ? "已处理" : "未处理" }}
        </el-descriptions-item>
        <el-descriptions-item label="堆栈摘要">
          <pre class="detail-pre">{{ detail?.stackSummary ?? "-" }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="发生时间">{{ detail?.occurredAt }}</el-descriptions-item>
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
  max-height: 320px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
}
</style>
