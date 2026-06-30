<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import Axios from "axios";
import { ElMessageBox, type UploadFile } from "element-plus";
import { message } from "@/utils/message";
import { getToken, formatToken } from "@/utils/auth";
import {
  deleteAttachment,
  getAttachments,
  uploadAttachment,
  type AttachmentItem,
  type AttachmentQuery
} from "@/api/system";

defineOptions({ name: "OperationAttachment" });

const loading = ref(false);
const uploading = ref(false);
const previewVisible = ref(false);
const previewUrl = ref("");
const rows = ref<AttachmentItem[]>([]);

const query = reactive<AttachmentQuery>({
  originalName: "",
  businessModule: "",
  referenceStatus: "",
  page: 1,
  pageSize: 10
});

const uploadForm = reactive({
  businessModule: "",
  businessRecordId: ""
});

const pagination = reactive({ totalItems: 0 });

const apiBase = computed(() => (import.meta.env.VITE_API_BASE_URL as string) || "");

function resolveError(error: any, fallback: string) {
  return error?.response?.data?.error?.message ?? error?.error?.message ?? fallback;
}

function asAttachment(row: unknown): AttachmentItem {
  return row as AttachmentItem;
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function authHeaders() {
  const token = getToken();
  return token?.accessToken
    ? { Authorization: formatToken(token.accessToken) }
    : {};
}

async function loadRows() {
  loading.value = true;
  try {
    const res = await getAttachments(query);
    rows.value = res.data.items;
    pagination.totalItems = res.data.pagination.totalItems;
  } catch (error) {
    message(resolveError(error, "附件列表加载失败"), { type: "error" });
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  query.page = 1;
  loadRows();
}

async function handleUpload(file: UploadFile) {
  if (!file.raw) return;
  uploading.value = true;
  try {
    const data = new FormData();
    data.append("file", file.raw);
    if (uploadForm.businessModule) {
      data.append("businessModule", uploadForm.businessModule);
    }
    if (uploadForm.businessRecordId) {
      data.append("businessRecordId", uploadForm.businessRecordId);
    }
    await uploadAttachment(data);
    message("上传成功", { type: "success" });
    loadRows();
  } catch (error) {
    message(resolveError(error, "上传失败"), { type: "error" });
  } finally {
    uploading.value = false;
  }
}

async function downloadBlob(row: AttachmentItem, mode: "download" | "preview") {
  const url = `${apiBase.value}/attachments/${row.id}/${mode}`;
  const res = await Axios.get(url, {
    responseType: "blob",
    headers: authHeaders()
  });
  return res.data as Blob;
}

async function handleDownload(row: AttachmentItem) {
  try {
    const blob = await downloadBlob(row, "download");
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = row.originalName;
    link.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    message(resolveError(error, "下载失败"), { type: "error" });
  }
}

async function handlePreview(row: AttachmentItem) {
  try {
    const blob = await downloadBlob(row, "preview");
    previewUrl.value = window.URL.createObjectURL(blob);
    previewVisible.value = true;
  } catch (error) {
    message(resolveError(error, "预览失败"), { type: "error" });
  }
}

async function handleDelete(row: AttachmentItem) {
  try {
    await ElMessageBox.confirm(`确认删除附件 ${row.originalName}？`, "删除确认", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    });
    await deleteAttachment(row.id);
    message("删除成功", { type: "success" });
    loadRows();
  } catch (error: any) {
    if (error === "cancel" || error === "close") return;
    message(resolveError(error, "删除失败"), { type: "error" });
  }
}

onMounted(loadRows);
</script>

<template>
  <div class="attachment-page">
    <el-card shadow="never" class="upload-panel">
      <el-form :model="uploadForm" inline label-width="84px">
        <el-form-item label="业务模块">
          <el-input v-model="uploadForm.businessModule" clearable placeholder="可选" />
        </el-form-item>
        <el-form-item label="业务记录">
          <el-input v-model="uploadForm.businessRecordId" clearable placeholder="可选 ID" />
        </el-form-item>
        <el-form-item>
          <el-upload
            :auto-upload="false"
            :show-file-list="false"
            :on-change="handleUpload"
          >
            <el-button type="primary" :loading="uploading">上传附件</el-button>
          </el-upload>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="search-panel">
      <el-form :model="query" inline label-width="84px">
        <el-form-item label="文件名">
          <el-input v-model="query.originalName" clearable placeholder="文件名" />
        </el-form-item>
        <el-form-item label="业务模块">
          <el-input v-model="query.businessModule" clearable placeholder="业务模块" />
        </el-form-item>
        <el-form-item label="引用状态">
          <el-select v-model="query.referenceStatus" clearable placeholder="全部">
            <el-option label="未引用" :value="0" />
            <el-option label="已引用" :value="1" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-panel">
      <el-table v-loading="loading" :data="rows" row-key="id">
        <el-table-column prop="originalName" label="文件名" min-width="220" />
        <el-table-column prop="mimeType" label="MIME" min-width="160" />
        <el-table-column label="大小" width="110">
          <template #default="{ row }">
            {{ formatSize(row.fileSize) }}
          </template>
        </el-table-column>
        <el-table-column prop="businessModule" label="业务模块" min-width="130" />
        <el-table-column prop="businessRecordId" label="业务记录" width="100" />
        <el-table-column label="引用" width="80">
          <template #default="{ row }">
            <el-tag :type="row.referenceStatus === 1 ? 'success' : 'info'">
              {{ row.referenceStatus === 1 ? "已引用" : "未引用" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="uploadedAt" label="上传时间" min-width="170" />
        <el-table-column label="操作" fixed="right" width="180">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :disabled="!row.mimeType.startsWith('image/')"
              @click="handlePreview(asAttachment(row))"
            >
              预览
            </el-button>
            <el-button link type="primary" @click="handleDownload(asAttachment(row))">
              下载
            </el-button>
            <el-button link type="danger" @click="handleDelete(asAttachment(row))">
              删除
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

    <el-dialog v-model="previewVisible" title="图片预览" width="720px">
      <img class="preview-image" :src="previewUrl" alt="附件预览" />
    </el-dialog>
  </div>
</template>

<style scoped>
.attachment-page {
  padding: 16px;
}

.upload-panel,
.search-panel,
.table-panel {
  border-radius: 6px;
}

.search-panel,
.table-panel {
  margin-top: 16px;
}

.pagination-row {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
}

.preview-image {
  display: block;
  max-width: 100%;
  max-height: 70vh;
  margin: 0 auto;
}
</style>
