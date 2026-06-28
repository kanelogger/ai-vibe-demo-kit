<script setup lang="ts">
import { useRenderIcon } from "@/components/ReIcon/src/hooks";

defineProps<{ icon: any }>();
</script>

<template>
  <component :is="useRenderIcon(icon)" v-bind="$attrs" />
</template>
