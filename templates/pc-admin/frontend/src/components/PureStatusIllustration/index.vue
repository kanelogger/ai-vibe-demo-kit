<script setup lang="ts">
interface Props {
  /** HTTP 状态码 */
  code: 403 | 404 | 500 | number;
  /** 主题色 */
  color?: string;
}

const props = withDefaults(defineProps<Props>(), {
  color: "var(--el-color-primary)"
});

const statusMap: Record<number, string> = {
  403: "Forbidden",
  404: "Not Found",
  500: "Server Error"
};
</script>

<template>
  <div
    class="pure-status-illustration"
    :style="{ '--status-theme-color': props.color }"
  >
    <div class="status-badge">
      <span class="status-code">{{ code }}</span>
      <span class="status-label">{{ statusMap[code] ?? "Error" }}</span>
    </div>
    <div class="status-circle circle-1" />
    <div class="status-circle circle-2" />
    <div class="status-circle circle-3" />
  </div>
</template>

<style scoped>
.pure-status-illustration {
  position: relative;
  width: 320px;
  height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-badge {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 200px;
  height: 200px;
  border-radius: 24px;
  background: color-mix(in srgb, var(--status-theme-color) 10%, white);
  box-shadow: 0 20px 50px color-mix(in srgb, var(--status-theme-color) 15%, transparent);
}

.status-code {
  font-size: 72px;
  font-weight: 800;
  line-height: 1;
  color: var(--status-theme-color);
}

.status-label {
  margin-top: 8px;
  font-size: 16px;
  color: color-mix(in srgb, var(--status-theme-color) 60%, #666);
}

.status-circle {
  position: absolute;
  border-radius: 50%;
  background: color-mix(in srgb, var(--status-theme-color) 10%, transparent);
  z-index: 1;
}

.circle-1 {
  width: 320px;
  height: 320px;
  top: 0;
  left: 0;
}

.circle-2 {
  width: 160px;
  height: 160px;
  top: -30px;
  right: -10px;
  opacity: 0.6;
}

.circle-3 {
  width: 100px;
  height: 100px;
  bottom: -20px;
  left: 20px;
  opacity: 0.4;
}

@media screen and (max-width: 768px) {
  .pure-status-illustration {
    width: 220px;
    height: 220px;
  }

  .status-badge {
    width: 140px;
    height: 140px;
  }

  .status-code {
    font-size: 48px;
  }

  .status-label {
    font-size: 13px;
  }

  .circle-1 {
    width: 220px;
    height: 220px;
  }

  .circle-2 {
    width: 110px;
    height: 110px;
  }

  .circle-3 {
    width: 70px;
    height: 70px;
  }
}
</style>
