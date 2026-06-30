<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessageBox, type FormInstance, type FormRules } from "element-plus";
import { message } from "@/utils/message";
import {
  createDepartment,
  deleteDepartment,
  getDepartments,
  updateDepartment,
  updateDepartmentStatus,
  type DepartmentItem,
  type DepartmentPayload,
  type DepartmentQuery
} from "@/api/system";

defineOptions({ name: "SystemDept" });

const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const formRef = ref<FormInstance>();
const rows = ref<DepartmentItem[]>([]);

const query = reactive<DepartmentQuery>({
  deptCode: "",
  deptName: "",
  status: "",
  page: 1,
  pageSize: 10
});

const pagination = reactive({ totalItems: 0 });

const form = reactive<DepartmentPayload & { id?: number }>({
  deptCode: "",
  deptName: "",
  status: 1,
  description: ""
});

const rules: FormRules = {
  deptCode: [{ required: true, message: "请输入部门编码", trigger: "blur" }],
  deptName: [{ required: true, message: "请输入部门名称", trigger: "blur" }]
};

function resolveError(error: any, fallback: string) {
  return error?.response?.data?.error?.message ?? error?.error?.message ?? fallback;
}

function asDept(row: unknown): DepartmentItem {
  return row as DepartmentItem;
}

function resetForm() {
  Object.assign(form, {
    id: undefined,
    deptCode: "",
    deptName: "",
    status: 1,
    description: ""
  });
}

async function loadRows() {
  loading.value = true;
  try {
    const res = await getDepartments(query);
    rows.value = res.data.items;
    pagination.totalItems = res.data.pagination.totalItems;
  } catch (error) {
    message(resolveError(error, "部门列表加载失败"), { type: "error" });
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  query.page = 1;
  loadRows();
}

function openCreate() {
  dialogMode.value = "create";
  resetForm();
  dialogVisible.value = true;
}

function openEdit(row: DepartmentItem) {
  dialogMode.value = "edit";
  Object.assign(form, {
    id: row.id,
    deptCode: row.deptCode,
    deptName: row.deptName,
    status: row.status,
    description: row.description ?? ""
  });
  dialogVisible.value = true;
}

async function submitForm() {
  if (!formRef.value) return;
  await formRef.value.validate(async valid => {
    if (!valid) return;
    saving.value = true;
    try {
      const payload = {
        deptCode: form.deptCode,
        deptName: form.deptName,
        status: form.status,
        description: form.description
      };
      if (dialogMode.value === "create") await createDepartment(payload);
      else if (form.id) await updateDepartment(form.id, payload);
      message("保存成功", { type: "success" });
      dialogVisible.value = false;
      loadRows();
    } catch (error) {
      message(resolveError(error, "保存失败"), { type: "error" });
    } finally {
      saving.value = false;
    }
  });
}

async function handleStatusChange(row: DepartmentItem) {
  const nextStatus = row.status === 1 ? 0 : 1;
  try {
    await updateDepartmentStatus(row.id, nextStatus);
    message(nextStatus === 1 ? "已启用" : "已停用", { type: "success" });
    loadRows();
  } catch (error) {
    message(resolveError(error, "状态更新失败"), { type: "error" });
  }
}

async function handleDelete(row: DepartmentItem) {
  try {
    await ElMessageBox.confirm(`确认删除部门 ${row.deptName}？`, "删除确认", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    });
    await deleteDepartment(row.id);
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
  <div class="system-dept-page">
    <el-card shadow="never" class="search-panel">
      <el-form :model="query" inline label-width="72px">
        <el-form-item label="部门编码">
          <el-input v-model="query.deptCode" clearable placeholder="部门编码" />
        </el-form-item>
        <el-form-item label="部门名称">
          <el-input v-model="query.deptName" clearable placeholder="部门名称" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部状态">
            <el-option label="启用" :value="1" />
            <el-option label="停用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="openCreate">新增部门</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-panel">
      <el-table v-loading="loading" :data="rows" row-key="id">
        <el-table-column prop="deptCode" label="部门编码" min-width="140" />
        <el-table-column prop="deptName" label="部门名称" min-width="160" />
        <el-table-column prop="description" label="说明" min-width="220" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'">
              {{ row.status === 1 ? "启用" : "停用" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" min-width="170" />
        <el-table-column label="操作" fixed="right" width="180">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(asDept(row))">
              编辑
            </el-button>
            <el-button link type="primary" @click="handleStatusChange(asDept(row))">
              {{ row.status === 1 ? "停用" : "启用" }}
            </el-button>
            <el-button link type="danger" @click="handleDelete(asDept(row))">
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

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增部门' : '编辑部门'"
      width="560px"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="92px">
        <el-form-item label="部门编码" prop="deptCode">
          <el-input v-model="form.deptCode" />
        </el-form-item>
        <el-form-item label="部门名称" prop="deptName">
          <el-input v-model="form.deptName" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio-button :value="1">启用</el-radio-button>
            <el-radio-button :value="0">停用</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.system-dept-page {
  padding: 16px;
}

.search-panel,
.table-panel {
  border-radius: 6px;
}

.table-panel {
  margin-top: 12px;
}

.pagination-row {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
}
</style>
