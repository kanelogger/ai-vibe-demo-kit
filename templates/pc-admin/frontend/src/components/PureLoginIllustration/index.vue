<script setup lang="ts">
interface Props {
  /** 主题色 */
  color?: string;
}

const props = withDefaults(defineProps<Props>(), {
  color: "var(--el-color-primary)"
});
</script>

<template>
  <div
    class="pure-login-illustration"
    :style="{ '--login-theme-color': props.color }"
  >
    <div class="illustration-card">
      <div class="illustration-header" />
      <div class="illustration-body">
        <div class="illustration-sidebar" />
        <div class="illustration-content">
          <div class="illustration-row" />
          <div class="illustration-row short" />
          <div class="illustration-row" />
          <div class="illustration-charts">
            <div class="illustration-chart" />
            <div class="illustration-chart secondary" />
          </div>
        </div>
      </div>
    </div>
    <div class="illustration-circle circle-1" />
    <div class="illustration-circle circle-2" />
    <div class="illustration-circle circle-3" />
  </div>
</template>

<style scoped>
.pure-login-illustration {
  position: relative;
  width: 500px;
  height: 380px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.illustration-card {
  position: relative;
  width: 320px;
  height: 240px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 60px color-mix(in srgb, var(--login-theme-color) 20%, transparent);
  overflow: hidden;
  z-index: 2;
}

.illustration-header {
  height: 36px;
  background: color-mix(in srgb, var(--login-theme-color) 12%, white);
}

.illustration-body {
  display: flex;
  height: calc(100% - 36px);
}

.illustration-sidebar {
  width: 56px;
  height: 100%;
  background: color-mix(in srgb, var(--login-theme-color) 6%, white);
}

.illustration-content {
  flex: 1;
  padding: 20px;
}

.illustration-row {
  height: 10px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--login-theme-color) 15%, #e8e8e8);
  margin-bottom: 12px;
}

.illustration-row.short {
  width: 70%;
}

.illustration-charts {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.illustration-chart {
  flex: 1;
  height: 70px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--login-theme-color) 20%, white);
}

.illustration-chart.secondary {
  background: color-mix(in srgb, var(--login-theme-color) 10%, white);
}

.illustration-circle {
  position: absolute;
  border-radius: 50%;
  background: color-mix(in srgb, var(--login-theme-color) 12%, transparent);
  z-index: 1;
}

.circle-1 {
  width: 120px;
  height: 120px;
  top: 0;
  right: 20px;
}

.circle-2 {
  width: 80px;
  height: 80px;
  bottom: 20px;
  left: 10px;
  opacity: 0.6;
}

.circle-3 {
  width: 48px;
  height: 48px;
  top: 60px;
  left: 0;
  opacity: 0.4;
}

@media screen and (max-width: 1180px) {
  .pure-login-illustration {
    width: 360px;
    height: 300px;
  }

  .illustration-card {
    width: 260px;
    height: 200px;
  }
}

@media screen and (max-width: 968px) {
  .pure-login-illustration {
    display: none;
  }
}
</style>
