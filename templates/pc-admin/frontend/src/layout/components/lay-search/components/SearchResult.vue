<script setup lang="ts">
import type { Props } from "../types";
import { getConfig } from "@/config";
import { useResizeObserver } from "@pureadmin/utils";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";
import { ref, computed, getCurrentInstance, onMounted } from "vue";

interface Emits {
  (e: "update:value", val: string): void;
  (e: "enter"): void;
}

const resultRef = ref();
const innerHeight = ref();
const emit = defineEmits<Emits>();
const instance = getCurrentInstance()!;
const props = withDefaults(defineProps<Props>(), {});

const itemStyle = computed(() => {
  return item => {
    return {
      background:
        item?.path === active.value ? getConfig().EpThemeColor : "",
      color: item.path === active.value ? "#fff" : "",
      fontSize: item.path === active.value ? "16px" : "14px"
    };
  };
});

const active = computed({
  get() {
    return props.value;
  },
  set(val: string) {
    emit("update:value", val);
  }
});

/** 鼠标移入 */
async function handleMouse(item) {
  active.value = item.path;
}

function handleTo() {
  emit("enter");
}

function resizeResult() {
  // el-scrollbar max-height="calc(90vh - 140px)"
  innerHeight.value = window.innerHeight - window.innerHeight / 10 - 140;
}

useResizeObserver(resultRef, resizeResult);

function handleScroll(index: number) {
  const curInstance = instance?.proxy?.$refs[`resultItemRef${index}`];
  if (!curInstance) return 0;
  const curRef = curInstance[0] as ElRef;
  const scrollTop = curRef.offsetTop + 128; // 128 两个result-item（56px+56px=112px）高度加上下margin（8px+8px=16px）
  return scrollTop > innerHeight.value ? scrollTop - innerHeight.value : 0;
}

onMounted(() => {
  resizeResult();
});

defineExpose({ handleScroll });
</script>

<template>
  <div ref="resultRef" class="result">
    <div
      v-for="(item, index) in options"
      :key="item.path"
      :ref="'resultItemRef' + index"
      class="result-item dark:bg-[#1d1d1d]"
      :style="itemStyle(item)"
      @click="handleTo"
      @mouseenter="handleMouse(item)"
    >
      <component :is="useRenderIcon(item.meta?.icon)" />
      <span class="result-item-title">
        {{ item.meta?.title }}
      </span>
      <kbd class="enter-badge">↵</kbd>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.result {
  padding-bottom: 12px;

  &-item {
    display: flex;
    align-items: center;
    height: 56px;
    padding: 14px;
    margin-top: 8px;
    cursor: pointer;
    border: 0.1px solid #ccc;
    border-radius: 4px;
    transition: font-size 0.16s;

    &-title {
      display: flex;
      flex: 1;
      margin-left: 5px;
    }
  }
}

.enter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 20px;
  padding: 0 4px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    "Liberation Mono", "Courier New", monospace;
  color: #666;
  background: #f4f4f5;
  border: 1px solid #d4d4d8;
  border-radius: 4px;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
}

.dark .enter-badge {
  color: #a1a1aa;
  background: #27272a;
  border-color: #3f3f46;
}
</style>
