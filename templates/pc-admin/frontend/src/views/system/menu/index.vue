<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessageBox, type FormInstance, type FormRules } from "element-plus";
import { message } from "@/utils/message";
import {
  createMenu,
  deleteMenu,
  getMenuTree,
  getRoleOptions,
  updateMenu,
  updateMenuStatus,
  type MenuDetail,
  type MenuPayload,
  type OptionItem
} from "@/api/system";

defineOptions({
  name: "SystemMenu"
});

const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const formRef = ref<FormInstance>();
const menus = ref<MenuDetail[]>([]);
const roles = ref<OptionItem[]>([]);

const form = reactive<MenuPayload & { id?: number }>({
  menuName: "",
  menuCode: "",
  parentId: null,
  icon: "",
  sortOrder: 0,
  routePath: "",
  componentPath: "",
  visible: 1,
  status: 1,
  roleIds: []
});

const rules: FormRules = {
  menuName: [{ required: true, message: "请输入菜单名称", trigger: "blur" }],
  menuCode: [{ required: true, message: "请输入菜单编码", trigger: "blur" }],
  routePath: [{ required: true, message: "请输入路由地址", trigger: "blur" }]
};

function resolveError(error: any, fallback: string) {
  return error?.response?.data?.error?.message ?? error?.error?.message ?? fallback;
}

function asMenu(row: unknown): MenuDetail {
  return row as MenuDetail;
}

function flattenMenus(list: MenuDetail[], result: MenuDetail[] = []) {
  for (const item of list) {
    result.push(item);
    if (item.children?.length) flattenMenus(item.children, result);
  }
  return result;
}

function resetForm(parentId: number | null = null) {
  Object.assign(form, {
    id: undefined,
    menuName: "",
    menuCode: "",
    parentId,
    icon: "",
    sortOrder: 0,
    routePath: "",
    componentPath: "",
    visible: 1,
    status: 1,
    roleIds: []
  });
}

async function loadMenus() {
  loading.value = true;
  try {
    const res = await getMenuTree();
    menus.value = res.data;
  } catch (error) {
    message(resolveError(error, "菜单加载失败"), { type: "error" });
  } finally {
    loading.value = false;
  }
}

async function loadOptions() {
  const roleRes = await getRoleOptions();
  roles.value = roleRes.data;
}

function openCreate(parentId: number | null = null) {
  dialogMode.value = "create";
  resetForm(parentId);
  dialogVisible.value = true;
}

function openEdit(row: MenuDetail) {
  dialogMode.value = "edit";
  Object.assign(form, {
    id: row.id,
    menuName: row.menuName,
    menuCode: row.menuCode,
    parentId: row.parentId,
    icon: row.icon ?? "",
    sortOrder: row.sortOrder,
    routePath: row.routePath,
    componentPath: row.componentPath ?? "",
    visible: row.visible,
    status: row.status,
    roleIds: row.roleIds ?? []
  });
  dialogVisible.value = true;
}

async function submitForm() {
  if (!formRef.value) return;
  await formRef.value.validate(async valid => {
    if (!valid) return;
    saving.value = true;
    try {
      const payload: MenuPayload = {
        menuName: form.menuName,
        menuCode: form.menuCode,
        parentId: form.parentId,
        icon: form.icon,
        sortOrder: Number(form.sortOrder ?? 0),
        routePath: form.routePath,
        componentPath: form.componentPath,
        visible: form.visible,
        status: form.status,
        roleIds: form.roleIds
      };
      if (dialogMode.value === "create") {
        await createMenu(payload);
      } else if (form.id) {
        await updateMenu(form.id, payload);
      }
      message("保存成功，重新登录后菜单变化生效", { type: "success" });
      dialogVisible.value = false;
      loadMenus();
    } catch (error) {
      message(resolveError(error, "保存失败"), { type: "error" });
    } finally {
      saving.value = false;
    }
  });
}

async function handleStatusChange(row: MenuDetail) {
  const nextStatus = row.status === 1 ? 0 : 1;
  try {
    await updateMenuStatus(row.id, nextStatus);
    message(nextStatus === 1 ? "已启用" : "已停用", { type: "success" });
    loadMenus();
  } catch (error) {
    message(resolveError(error, "状态更新失败"), { type: "error" });
  }
}

async function handleDelete(row: MenuDetail) {
  try {
    await ElMessageBox.confirm(`确认删除菜单 ${row.menuName}？`, "删除确认", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    });
    await deleteMenu(row.id);
    message("删除成功", { type: "success" });
    loadMenus();
  } catch (error: any) {
    if (error === "cancel" || error === "close") return;
    message(resolveError(error, "删除失败"), { type: "error" });
  }
}

onMounted(async () => {
  await loadOptions();
  await loadMenus();
});
</script>

<template>
  <div class="system-menu-page">
    <el-card shadow="never" class="toolbar-panel">
      <el-button type="primary" @click="openCreate()">新增菜单</el-button>
      <el-button @click="loadMenus">刷新</el-button>
    </el-card>

    <el-card shadow="never" class="table-panel">
      <el-table
        v-loading="loading"
        :data="menus"
        row-key="id"
        default-expand-all
      >
        <el-table-column prop="menuName" label="菜单名称" min-width="160" />
        <el-table-column prop="menuCode" label="菜单编码" min-width="160" />
        <el-table-column prop="routePath" label="路由地址" min-width="180" />
        <el-table-column prop="componentPath" label="组件路径" min-width="200" />
        <el-table-column prop="sortOrder" label="排序" width="80" />
        <el-table-column label="显示" width="80">
          <template #default="{ row }">
            <el-tag :type="row.visible === 1 ? 'success' : 'info'">
              {{ row.visible === 1 ? "显示" : "隐藏" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'">
              {{ row.status === 1 ? "启用" : "停用" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="授权角色" min-width="180">
          <template #default="{ row }">
            <el-space wrap>
              <el-tag
                v-for="roleId in row.roleIds"
                :key="roleId"
                size="small"
                type="info"
              >
                {{ roles.find(role => role.value === roleId)?.label ?? roleId }}
              </el-tag>
            </el-space>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="260">
          <template #default="{ row }">
            <el-button link type="primary" @click="openCreate(row.id)">
              新增子级
            </el-button>
            <el-button link type="primary" @click="openEdit(asMenu(row))">
              编辑
            </el-button>
            <el-button link type="primary" @click="handleStatusChange(asMenu(row))">
              {{ row.status === 1 ? "停用" : "启用" }}
            </el-button>
            <el-button link type="danger" @click="handleDelete(asMenu(row))">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增菜单' : '编辑菜单'"
      width="760px"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="菜单名称" prop="menuName">
              <el-input v-model="form.menuName" placeholder="菜单名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="菜单编码" prop="menuCode">
              <el-input v-model="form.menuCode" placeholder="菜单编码" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="父级菜单">
              <el-select
                v-model="form.parentId"
                clearable
                class="w-full!"
                placeholder="顶级菜单"
              >
                <el-option
                  v-for="item in flattenMenus(menus).filter(menu => menu.id !== form.id)"
                  :key="item.id"
                  :label="item.menuName"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="图标">
              <el-input v-model="form.icon" placeholder="Element Plus 图标名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="排序">
              <el-input-number v-model="form.sortOrder" :min="0" class="w-full!" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="路由地址" prop="routePath">
              <el-input v-model="form.routePath" placeholder="/system/users" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="组件路径">
              <el-input
                v-model="form.componentPath"
                placeholder="/system/user/index，目录菜单可留空"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="显示">
              <el-radio-group v-model="form.visible">
                <el-radio-button :value="1">显示</el-radio-button>
                <el-radio-button :value="0">隐藏</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-radio-group v-model="form.status">
                <el-radio-button :value="1">启用</el-radio-button>
                <el-radio-button :value="0">停用</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="授权角色">
              <el-select
                v-model="form.roleIds"
                multiple
                class="w-full!"
                placeholder="选择可访问角色"
              >
                <el-option
                  v-for="item in roles"
                  :key="item.id"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
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
.system-menu-page {
  padding: 16px;
}

.toolbar-panel,
.table-panel {
  border-radius: 6px;
}

.table-panel {
  margin-top: 12px;
}
</style>
