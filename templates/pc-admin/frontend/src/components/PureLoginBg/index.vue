<script setup lang="ts">
interface Props {
  /** 主题色，默认跟随 Element Plus 主色 */
  color?: string;
}

const props = withDefaults(defineProps<Props>(), {
  color: "var(--el-color-primary)"
});
</script>

<template>
  <div class="pure-login-bg" :style="{ '--login-theme-color': props.color }">
    <div class="pure-login-bg__wave wave-1" />
    <div class="pure-login-bg__wave wave-2" />
    <div class="pure-login-bg__wave wave-3" />
    <div class="pure-login-bg__gradient" />
  </div>
</template>

<style scoped>
.pure-login-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}

.pure-login-bg__gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--login-theme-color) 15%, white) 0%,
    color-mix(in srgb, var(--login-theme-color) 5%, white) 50%,
    transparent 100%
  );
}

.pure-login-bg__wave {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 200%;
  height: 100%;
  border-radius: 40%;
  background: color-mix(in srgb, var(--login-theme-color) 8%, transparent);
  transform-origin: 50% 100%;
  animation: drift 18s infinite linear;
}

.wave-1 {
  bottom: -45%;
  animation-duration: 22s;
}

.wave-2 {
  bottom: -55%;
  opacity: 0.6;
  animation-duration: 16s;
  animation-direction: reverse;
}

.wave-3 {
  bottom: -65%;
  opacity: 0.3;
  animation-duration: 26s;
}

@keyframes drift {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media screen and (max-width: 968px) {
  .pure-login-bg {
    display: none;
  }
}
</style>
