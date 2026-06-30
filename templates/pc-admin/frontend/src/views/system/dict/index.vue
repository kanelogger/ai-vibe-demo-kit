<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessageBox, type FormInstance, type FormRules } from "element-plus";
import { message } from "@/utils/message";
import {
  createDictItem,
  createDictType,
  deleteDictItem,
  deleteDictType,
  getDictItems,
  getDictTypes,
  sortDictItems,
  updateDictItem,
  updateDictItemStatus,
  updateDictType,
  updateDictTypeStatus,
  type DictItem,
  type DictItemPayload,
  type DictTypeItem,
  type DictTypePayload,
  type DictTypeQuery
} from "@/api/system";

defineOptions({ name: "SystemDict" });

const typeLoading = ref(false);
const itemLoading = ref(false);
const saving = ref(false);
const typeRows = ref<DictTypeItem[]>([]);
const itemRows = ref<DictItem[]>([]);
const selectedTypeId = ref<number | null>(null);
const typeDialogVisible = ref(false);
const itemDialogVisible = ref(false);
const typeDialogMode = ref<"create" | "edit">("create");
const itemDialogMode = ref<"create" | "edit">("create");
const typeFormRef = ref<FormInstance>();
const itemFormRef = ref<FormInstance>();

const typeQuery = reactive<DictTypeQuery>({
  dictCode: "",
  dictName: "",
  status: "",
  page: 1,
  pageSize: 10
});

const typePagination = reactive({ totalItems: 0 });

const typeForm = reactive<DictTypePayload & { id?: number }>({
  dictCode: "",
  dictName: "",
  status: 1,
  description: ""
});

const itemForm = reactive<DictItemPayload & { id?: number }>({
  itemValue: "",
  itemLabel: "",
  sortOrder: 0,
  status: 1,
  description: ""
});

const selectedType = computed(() => {
  return typeRows.value.find(item => item.id === selectedTypeId.value) ?? null;
});

const typeRules: FormRules = {
  dictCode: [{ required: true, message: "请输入字典编码", trigger: "blur" }],
  dictName: [{ required: true, message: "请输入字典名称", trigger: "blur" }]
};

const itemRules: FormRules = {
  itemValue: [{ required: true, message: "请输入字典值", trigger: "blur" }],
  itemLabel: [{ required: true, message: "请输入字典标签", trigger: "blur" }]
};

function resolveError(error: any, fallback: string) {
  return error?.response?.data?.error?.message ?? error?.error?.message ?? fallback;
}

function asType(row: unknown): DictTypeItem {
  return row as DictTypeItem;
}

function asItem(row: unknown): DictItem {
  return row as DictItem;
}

function resetTypeForm() {
  Object.assign(typeForm, {
    id: undefined,
    dictCode: "",
    dictName: "",
    status: 1,
    description: ""
  });
}

function resetItemForm() {
  Object.assign(itemForm, {
    id: undefined,
    itemValue: "",
    itemLabel: "",
    sortOrder: itemRows.value.length,
    status: 1,
    description: ""
  });
}

async function loadTypes() {
  typeLoading.value = true;
  try {
    const res = await getDictTypes(typeQuery);
    typeRows.value = res.data.items;
    typePagination.totalItems = res.data.pagination.totalItems;
    if (!selectedTypeId.value && typeRows.value.length > 0) {
      selectedTypeId.value = typeRows.value[0].id;
      await loadItems();
    } else if (selectedTypeId.value) {
      const stillExists = typeRows.value.some(item => item.id === selectedTypeId.value);
      if (!stillExists) {
        selectedTypeId.value = typeRows.value[0]?.id ?? null;
      }
      await loadItems();
    } else {
      itemRows.value = [];
    }
  } catch (error) {
    message(resolveError(error, "字典类型加载失败"), { type: "error" });
  } finally {
    typeLoading.value = false;
  }
}

async function loadItems() {
  if (!selectedTypeId.value) {
    itemRows.value = [];
    return;
  }
  itemLoading.value = true;
  try {
    const res = await getDictItems(selectedTypeId.value);
    itemRows.value = res.data;
  } catch (error) {
    message(resolveError(error, "字典项加载失败"), { type: "error" });
  } finally {
    itemLoading.value = false;
  }
}

function handleTypeSearch() {
  typeQuery.page = 1;
  selectedTypeId.value = null;
  loadTypes();
}

function selectType(row: DictTypeItem) {
  selectedTypeId.value = row.id;
  loadItems();
}

function openCreateType() {
  typeDialogMode.value = "create";
  resetTypeForm();
  typeDialogVisible.value = true;
}

function openEditType(row: DictTypeItem) {
  typeDialogMode.value = "edit";
  Object.assign(typeForm, {
    id: row.id,
    dictCode: row.dictCode,
    dictName: row.dictName,
    status: row.status,
    description: row.description ?? ""
  });
  typeDialogVisible.value = true;
}

async function submitTypeForm() {
  if (!typeFormRef.value) return;
  await typeFormRef.value.validate(async valid => {
    if (!valid) return;
    saving.value = true;
    try {
      const payload = {
        dictCode: typeForm.dictCode,
        dictName: typeForm.dictName,
        status: typeForm.status,
        description: typeForm.description
      };
      if (typeDialogMode.value === "create") await createDictType(payload);
      else if (typeForm.id) await updateDictType(typeForm.id, payload);
      message("保存成功", { type: "success" });
      typeDialogVisible.value = false;
      loadTypes();
    } catch (error) {
      message(resolveError(error, "保存失败"), { type: "error" });
    } finally {
      saving.value = false;
    }
  });
}

async function handleTypeStatusChange(row: DictTypeItem) {
  const nextStatus = row.status === 1 ? 0 : 1;
  try {
    await updateDictTypeStatus(row.id, nextStatus);
    message(nextStatus === 1 ? "已启用" : "已停用", { type: "success" });
    loadTypes();
  } catch (error) {
    message(resolveError(error, "状态更新失败"), { type: "error" });
  }
}

async function handleDeleteType(row: DictTypeItem) {
  try {
    await ElMessageBox.confirm(`确认删除字典类型 ${row.dictName}？`, "删除确认", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    });
    await deleteDictType(row.id);
    message("删除成功", { type: "success" });
    if (selectedTypeId.value === row.id) selectedTypeId.value = null;
    loadTypes();
  } catch (error: any) {
    if (error === "cancel" || error === "close") return;
    message(resolveError(error, "删除失败"), { type: "error" });
  }
}

function openCreateItem() {
  if (!selectedTypeId.value) {
    message("请先选择字典类型", { type: "warning" });
    return;
  }
  itemDialogMode.value = "create";
  resetItemForm();
  itemDialogVisible.value = true;
}

function openEditItem(row: DictItem) {
  itemDialogMode.value = "edit";
  Object.assign(itemForm, {
    id: row.id,
    itemValue: row.itemValue,
    itemLabel: row.itemLabel,
    sortOrder: row.sortOrder,
    status: row.status,
    description: row.description ?? ""
  });
  itemDialogVisible.value = true;
}

async function submitItemForm() {
  if (!itemFormRef.value || !selectedTypeId.value) return;
  await itemFormRef.value.validate(async valid => {
    if (!valid) return;
    saving.value = true;
    try {
      const payload = {
        itemValue: itemForm.itemValue,
        itemLabel: itemForm.itemLabel,
        sortOrder: Number(itemForm.sortOrder),
        status: itemForm.status,
        description: itemForm.description
      };
      if (itemDialogMode.value === "create") {
        await createDictItem(selectedTypeId.value!, payload);
      } else if (itemForm.id) {
        await updateDictItem(itemForm.id, payload);
      }
      message("保存成功", { type: "success" });
      itemDialogVisible.value = false;
      loadItems();
    } catch (error) {
      message(resolveError(error, "保存失败"), { type: "error" });
    } finally {
      saving.value = false;
    }
  });
}

async function handleItemStatusChange(row: DictItem) {
  const nextStatus = row.status === 1 ? 0 : 1;
  try {
    await updateDictItemStatus(row.id, nextStatus);
    message(nextStatus === 1 ? "已启用" : "已停用", { type: "success" });
    loadItems();
  } catch (error) {
    message(resolveError(error, "状态更新失败"), { type: "error" });
  }
}

async function handleSaveSort() {
  try {
    await sortDictItems(
      itemRows.value.map(item => ({ id: item.id, sortOrder: Number(item.sortOrder) }))
    );
    message("排序已保存", { type: "success" });
    loadItems();
  } catch (error) {
    message(resolveError(error, "排序保存失败"), { type: "error" });
  }
}

async function handleDeleteItem(row: DictItem) {
  try {
    await ElMessageBox.confirm(`确认删除字典项 ${row.itemLabel}？`, "删除确认", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    });
    await deleteDictItem(row.id);
    message("删除成功", { type: "success" });
    loadItems();
  } catch (error: any) {
    if (error === "cancel" || error === "close") return;
    message(resolveError(error, "删除失败"), { type: "error" });
  }
}

onMounted(loadTypes);
</script>

<template>
  <div class="system-dict-page">
    <el-card shadow="never" class="search-panel">
      <el-form :model="typeQuery" inline label-width="72px">
        <el-form-item label="字典编码">
          <el-input v-model="typeQuery.dictCode" clearable placeholder="字典编码" />
        </el-form-item>
        <el-form-item label="字典名称">
          <el-input v-model="typeQuery.dictName" clearable placeholder="字典名称" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="typeQuery.status" clearable placeholder="全部状态">
            <el-option label="启用" :value="1" />
            <el-option label="停用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleTypeSearch">查询</el-button>
          <el-button @click="openCreateType">新增类型</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <div class="dict-layout">
      <el-card shadow="never" class="type-panel">
        <el-table
          v-loading="typeLoading"
          :data="typeRows"
          row-key="id"
          highlight-current-row
          @current-change="row => row && selectType(asType(row))"
        >
          <el-table-column prop="dictCode" label="编码" min-width="130" />
          <el-table-column prop="dictName" label="名称" min-width="130" />
          <el-table-column label="状态" width="78">
            <template #default="{ row }">
              <el-tag :type="row.status === 1 ? 'success' : 'info'">
                {{ row.status === 1 ? "启用" : "停用" }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" fixed="right" width="176">
            <template #default="{ row }">
              <el-button link type="primary" @click.stop="openEditType(asType(row))">
                编辑
              </el-button>
              <el-button
                link
                type="primary"
                @click.stop="handleTypeStatusChange(asType(row))"
              >
                {{ row.status === 1 ? "停用" : "启用" }}
              </el-button>
              <el-button link type="danger" @click.stop="handleDeleteType(asType(row))">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-row">
          <el-pagination
            v-model:current-page="typeQuery.page"
            v-model:page-size="typeQuery.pageSize"
            :page-sizes="[10, 20, 50]"
            small
            layout="total, prev, pager, next"
            :total="typePagination.totalItems"
            @size-change="loadTypes"
            @current-change="loadTypes"
          />
        </div>
      </el-card>

      <el-card shadow="never" class="item-panel">
        <template #header>
          <div class="panel-header">
            <span>{{ selectedType?.dictName ?? "字典项" }}</span>
            <div>
              <el-button @click="handleSaveSort" :disabled="!selectedTypeId">
                保存排序
              </el-button>
              <el-button type="primary" @click="openCreateItem">新增字典项</el-button>
            </div>
          </div>
        </template>
        <el-table v-loading="itemLoading" :data="itemRows" row-key="id">
          <el-table-column prop="itemValue" label="字典值" min-width="130" />
          <el-table-column prop="itemLabel" label="字典标签" min-width="150" />
          <el-table-column label="排序" width="110">
            <template #default="{ row }">
              <el-input-number
                v-model="row.sortOrder"
                :min="0"
                controls-position="right"
                size="small"
              />
            </template>
          </el-table-column>
          <el-table-column prop="description" label="说明" min-width="180" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 1 ? 'success' : 'info'">
                {{ row.status === 1 ? "启用" : "停用" }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" fixed="right" width="180">
            <template #default="{ row }">
              <el-button link type="primary" @click="openEditItem(asItem(row))">
                编辑
              </el-button>
              <el-button link type="primary" @click="handleItemStatusChange(asItem(row))">
                {{ row.status === 1 ? "停用" : "启用" }}
              </el-button>
              <el-button link type="danger" @click="handleDeleteItem(asItem(row))">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <el-dialog
      v-model="typeDialogVisible"
      :title="typeDialogMode === 'create' ? '新增字典类型' : '编辑字典类型'"
      width="560px"
    >
      <el-form ref="typeFormRef" :model="typeForm" :rules="typeRules" label-width="92px">
        <el-form-item label="字典编码" prop="dictCode">
          <el-input v-model="typeForm.dictCode" />
        </el-form-item>
        <el-form-item label="字典名称" prop="dictName">
          <el-input v-model="typeForm.dictName" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="typeForm.status">
            <el-radio-button :value="1">启用</el-radio-button>
            <el-radio-button :value="0">停用</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="typeForm.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="typeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitTypeForm">
          保存
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="itemDialogVisible"
      :title="itemDialogMode === 'create' ? '新增字典项' : '编辑字典项'"
      width="560px"
    >
      <el-form ref="itemFormRef" :model="itemForm" :rules="itemRules" label-width="92px">
        <el-form-item label="字典值" prop="itemValue">
          <el-input v-model="itemForm.itemValue" />
        </el-form-item>
        <el-form-item label="字典标签" prop="itemLabel">
          <el-input v-model="itemForm.itemLabel" />
        </el-form-item>
        <el-form-item label="排序号">
          <el-input-number v-model="itemForm.sortOrder" :min="0" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="itemForm.status">
            <el-radio-button :value="1">启用</el-radio-button>
            <el-radio-button :value="0">停用</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="itemForm.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="itemDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitItemForm">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.system-dict-page {
  padding: 16px;
}

.search-panel,
.type-panel,
.item-panel {
  border-radius: 6px;
}

.dict-layout {
  display: grid;
  grid-template-columns: minmax(440px, 0.9fr) minmax(520px, 1.1fr);
  gap: 16px;
  margin-top: 16px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pagination-row {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
}
</style>
