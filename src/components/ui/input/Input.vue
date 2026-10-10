<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { ref } from "vue"
import { useVModel } from "@vueuse/core"
import { cn } from "@/lib/utils"

const props = defineProps<{
  defaultValue?: string | number
  modelValue?: string | number
  class?: HTMLAttributes["class"]
}>()

const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void
}>()

const modelValue = useVModel(props, "modelValue", emits, {
  passive: true,
  defaultValue: props.defaultValue,
})
const input = ref<HTMLInputElement>()
defineExpose({ focus: () => input.value?.focus(), blur: () => input.value?.blur() })
</script>

<template>
  <input ref="input" v-model="modelValue" :class="cn('flex h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-[15px] transition-colors duration-150 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50', props.class)">
</template>

