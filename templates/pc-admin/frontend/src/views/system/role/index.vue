<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessageBox, type FormInstance, type FormRules } from "element-plus";
import { message } from "@/utils/message";
import {
  createRole,
  deleteRole,
  getMenuTree,
  getRole,
  getRoles,
  updateRole,
  updateRoleStatus,
  type MenuDetail,
  type RoleListItem,
  type RolePayload,
  type RoleQuery
} from "@/api/system";

defineOptions({
  name: "SystemRole"
});

const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const formRef = ref<FormInstance>();
const roles = ref<RoleListItem[]>([]);
const menus = ref<MenuDetail[]>([]);

const query = reactive<RoleQuery>({
  roleName: "",
  roleCode: "",
  status: "",
  page: 1,
  pageSize: 10
});

const pagination = reactive({
  totalItems: 0,
  totalPages: 0
});

const form = reactive<RolePayload & { id?: number }>({
  roleName: "",
  roleCode: "",
  status: 1,
  description: "",
  menuIds: []
});

const rules: FormRules = {
  roleName: [{ required: true, message: "请输入角色名称", trigger: "blur" }],
  roleCode: [{ required: true, message: "请输入角色编码", trigger: "blur" }]
};

const dialogTitle = computed(() =>
  dialogMode.value === "create" ? "新增角色" : "编辑角色"
);

function resolveError(error: any, fallback: string) {
  return error?.response?.data?.error?.message ?? error?.error?.message ?? fallback;
}

function asRole(row: unknown): RoleListItem {
  return row as RoleListItem;
}

function resetForm() {
  Object.assign(form, {
    id: undefined,
    roleName: "",
    roleCode: "",
    status: 1,
    description: "",
    menuIds: []
  });
}

async function loadMenus() {
  const res = await getMenuTree();
  menus.value = res.data;
}

async function loadRoles() {
  loading.value = true;
  try {
    const res = await getRoles(query);
    roles.value = res.data.items;
    pagination.totalItems = res.data.pagination.totalItems;
    pagination.totalPages = res.data.pagination.totalPages;
  } catch (error) {
    message(resolveError(error, "角色列表加载失败"), { type: "error" });
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  query.page = 1;
  loadRoles();
}

function openCreate() {
  dialogMode.value = "create";
  resetForm();
  dialogVisible.value = true;
}

async function openEdit(row: RoleListItem) {
  dialogMode.value = "edit";
  try {
    const res = await getRole(row.id);
    Object.assign(form, {
      id: res.data.id,
      roleName: res.data.roleName,
      roleCode: res.data.roleCode,
      status: res.data.status,
      description: res.data.description ?? "",
      menuIds: res.data.menuIds
    });
    dialogVisible.value = true;
  } catch (error) {
    message(resolveError(error, "角色详情加载失败"), { type: "error" });
  }
}

async function submitForm() {
  if (!formRef.value) return;
  await formRef.value.validate(async valid => {
    if (!valid) return;
    saving.value = true;
    try {
      const payload: RolePayload = {
        roleName: form.roleName,
        roleCode: form.roleCode,
        status: form.status,
        description: form.description,
        menuIds: form.menuIds
      };
      if (dialogMode.value === "create") {
        await createRole(payload);
      } else if (form.id) {
        await updateRole(form.id, payload);
      }
      message("保存成功，重新登录后菜单权限生效", { type: "success" });
      dialogVisible.value = false;
      loadRoles();
    } catch (error) {
      message(resolveError(error, "保存失败"), { type: "error" });
    } finally {
      saving.value = false;
    }
  });
}

async function handleStatusChange(row: RoleListItem) {
  const nextStatus = row.status === 1 ? 0 : 1;
  try {
    await updateRoleStatus(row.id, nextStatus);
    message(nextStatus === 1 ? "已启用" : "已停用", { type: "success" });
    loadRoles();
  } catch (error) {
    message(resolveError(error, "状态更新失败"), { type: "error" });
  }
}

async function handleDelete(row: RoleListItem) {
  try {
    await ElMessageBox.confirm(`确认删除角色 ${row.roleName}？`, "删除确认", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    });
    await deleteRole(row.id);
    message("删除成功", { type: "success" });
    loadRoles();
  } catch (error: any) {
    if (error === "cancel" || error === "close") return;
    message(resolveError(error, "删除失败"), { type: "error" });
  }
}

onMounted(async () => {
  await loadMenus();
  await loadRoles();
});
</script>

<template>
  <div class="system-role-page">
    <el-card shadow="never" class="search-panel">
      <el-form :model="query" inline label-width="72px">
        <el-form-item label="角色名称">
          <el-input v-model="query.roleName" clearable placeholder="角色名称" />
        </el-form-item>
        <el-form-item label="角色编码">
          <el-input v-model="query.roleCode" clearable placeholder="角色编码" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部状态">
            <el-option label="启用" :value="1" />
            <el-option label="停用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="openCreate">新增角色</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-panel">
      <el-table v-loading="loading" :data="roles" row-key="id">
        <el-table-column prop="roleName" label="角色名称" min-width="140" />
        <el-table-column prop="roleCode" label="角色编码" min-width="140" />
        <el-table-column prop="description" label="说明" min-width="220" />
        <el-table-column prop="userCount" label="用户数" width="90" />
        <el-table-column label="超级管理员" width="110">
          <template #default="{ row }">
            <el-tag :type="row.isSuperAdmin ? 'danger' : 'info'">
              {{ row.isSuperAdmin ? "是" : "否" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'">
              {{ row.status === 1 ? "启用" : "停用" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" min-width="170" />
        <el-table-column label="操作" fixed="right" width="220">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(asRole(row))">
              编辑/授权
            </el-button>
            <el-button
              link
              type="primary"
              :disabled="row.isSuperAdmin"
              @click="handleStatusChange(asRole(row))"
            >
              {{ row.status === 1 ? "停用" : "启用" }}
            </el-button>
            <el-button
              link
              type="danger"
              :disabled="row.isSuperAdmin"
              @click="handleDelete(asRole(row))"
            >
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
          @size-change="loadRoles"
          @current-change="loadRoles"
        />
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="720px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="92px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="角色名称" prop="roleName">
              <el-input v-model="form.roleName" placeholder="角色名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="角色编码" prop="roleCode">
              <el-input
                v-model="form.roleCode"
                :disabled="dialogMode === 'edit'"
                placeholder="角色编码"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态" prop="status">
              <el-radio-group v-model="form.status">
                <el-radio-button :value="1">启用</el-radio-button>
                <el-radio-button :value="0">停用</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="说明">
              <el-input
                v-model="form.description"
                type="textarea"
                :rows="2"
                placeholder="角色说明"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="菜单授权">
              <el-tree
                ref="menuTreeRef"
                v-model:checked-keys="form.menuIds"
                :data="menus"
                node-key="id"
                show-checkbox
                default-expand-all
                check-strictly
                :props="{ label: 'menuName', children: 'children' }"
                class="menu-tree"
              />
            </el-form-item>
          </el-col>
        </el-row>
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
.system-role-page {
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

.menu-tree {
  width: 100%;
  max-height: 360px;
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
}
</style>
