<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { message } from "@/utils/message";
import {
  getMessage,
  getMessages,
  markMessageRead,
  markMessagesRead,
  type MessageDetail,
  type MessageListItem,
  type MessageQuery
} from "@/api/system";

defineOptions({ name: "OperationMessage" });

const loading = ref(false);
const detailLoading = ref(false);
const detailVisible = ref(false);
const rows = ref<MessageListItem[]>([]);
const selectedRows = ref<MessageListItem[]>([]);
const detail = ref<MessageDetail | null>(null);

const query = reactive<MessageQuery>({
  title: "",
  messageType: "",
  readStatus: "",
  sentStartAt: "",
  sentEndAt: "",
  page: 1,
  pageSize: 10
});

const pagination = reactive({ totalItems: 0 });

function resolveError(error: any, fallback: string) {
  return error?.response?.data?.error?.message ?? error?.error?.message ?? fallback;
}

function asMessage(row: unknown): MessageListItem {
  return row as MessageListItem;
}

function messageTypeText(type: string) {
  const map: Record<string, string> = {
    NOTICE: "通知",
    ANNOUNCEMENT: "公告"
  };
  return map[type] ?? type;
}

async function loadRows() {
  loading.value = true;
  try {
    const res = await getMessages(query);
    rows.value = res.data.items;
    pagination.totalItems = res.data.pagination.totalItems;
  } catch (error) {
    message(resolveError(error, "消息列表加载失败"), { type: "error" });
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  query.page = 1;
  loadRows();
}

function handleSelectionChange(selection: MessageListItem[]) {
  selectedRows.value = selection;
}

async function openDetail(row: MessageListItem) {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    const res = await getMessage(row.id);
    detail.value = res.data;
  } catch (error) {
    message(resolveError(error, "消息详情加载失败"), { type: "error" });
  } finally {
    detailLoading.value = false;
  }
}

async function handleRead(row: MessageListItem) {
  try {
    await markMessageRead(row.id);
    message("已标记为已读", { type: "success" });
    loadRows();
  } catch (error) {
    message(resolveError(error, "标记已读失败"), { type: "error" });
  }
}

async function handleBatchRead(all = false) {
  const ids = selectedRows.value.map(item => item.id);
  if (!all && ids.length === 0) {
    message("请先选择消息", { type: "warning" });
    return;
  }
  try {
    await markMessagesRead(all ? { all: true } : { ids });
    message("已标记为已读", { type: "success" });
    loadRows();
  } catch (error) {
    message(resolveError(error, "批量已读失败"), { type: "error" });
  }
}

onMounted(loadRows);
</script>

<template>
  <div class="message-page">
    <el-card shadow="never" class="search-panel">
      <el-form :model="query" inline label-width="72px">
        <el-form-item label="标题">
          <el-input v-model="query.title" clearable placeholder="消息标题" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="query.messageType" clearable placeholder="全部类型">
            <el-option label="通知" value="NOTICE" />
            <el-option label="公告" value="ANNOUNCEMENT" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.readStatus" clearable placeholder="全部状态">
            <el-option label="未读" :value="0" />
            <el-option label="已读" :value="1" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleBatchRead(false)">选中已读</el-button>
          <el-button @click="handleBatchRead(true)">全部已读</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-panel">
      <el-table
        v-loading="loading"
        :data="rows"
        row-key="id"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column prop="title" label="标题" min-width="220" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            {{ messageTypeText(row.messageType) }}
          </template>
        </el-table-column>
        <el-table-column prop="summary" label="摘要" min-width="240" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.readStatus === 1 ? 'info' : 'warning'">
              {{ row.readStatus === 1 ? "已读" : "未读" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sentAt" label="发送时间" min-width="170" />
        <el-table-column prop="readAt" label="阅读时间" min-width="170" />
        <el-table-column label="操作" fixed="right" width="150">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(asMessage(row))">
              查看
            </el-button>
            <el-button
              link
              type="primary"
              :disabled="row.readStatus === 1"
              @click="handleRead(asMessage(row))"
            >
              已读
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

    <el-dialog v-model="detailVisible" title="消息详情" width="640px">
      <div v-loading="detailLoading" class="message-detail">
        <h3>{{ detail?.title ?? "-" }}</h3>
        <div class="detail-meta">
          <span>{{ detail ? messageTypeText(detail.messageType) : "-" }}</span>
          <span>{{ detail?.sentAt ?? "-" }}</span>
        </div>
        <p class="detail-summary">{{ detail?.summary }}</p>
        <div class="detail-content">{{ detail?.content }}</div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.message-page {
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

.message-detail h3 {
  margin: 0;
  font-size: 18px;
}

.detail-meta {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  color: var(--el-text-color-secondary);
}

.detail-summary {
  margin: 16px 0;
  color: var(--el-text-color-regular);
}

.detail-content {
  line-height: 1.8;
  white-space: pre-wrap;
}
</style>
