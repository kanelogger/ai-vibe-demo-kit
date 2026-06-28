<script setup lang="ts">
import { computed } from "vue";
import UserFilled from "~icons/ep/user-filled";

interface Props {
  /** 头像图片地址 */
  src?: string;
  /** 用户名，用于无头像时生成首字母 */
  username?: string;
  /** 尺寸，支持数字像素或字符串 */
  size?: number | string;
}

const props = withDefaults(defineProps<Props>(), {
  size: 24
});

const firstLetter = computed(() => {
  if (!props.username) return "";
  return props.username.charAt(0).toUpperCase();
});

const avatarSizeNum = computed(() =>
  typeof props.size === "number" ? props.size : parseInt(props.size, 10) || 24
);

const avatarSizePx = computed(() => `${avatarSizeNum.value}px`);
</script>

<template>
  <el-avatar
    :src="src"
    :size="avatarSizeNum"
    :icon="UserFilled"
    class="pure-avatar"
  >
    <template v-if="!src && firstLetter" #default>
      <span class="pure-avatar-letter">{{ firstLetter }}</span>
    </template>
  </el-avatar>
</template>

<style scoped>
.pure-avatar {
  --el-avatar-bg-color: var(--el-color-primary);
  flex-shrink: 0;
}

.pure-avatar-letter {
  font-size: calc(v-bind(avatarSizePx) * 0.45);
  font-weight: 600;
  color: #fff;
}
</style>
