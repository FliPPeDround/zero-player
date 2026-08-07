<script setup lang="ts">
import LayoutToolbar from '@antfu/design/components/Layout/LayoutToolbar.vue'
</script>

<template>
  <div class="color-base font-sans bg-base min-h-screen">
    <LayoutToolbar>
      <template #start>
        <NuxtLink to="/" class="font-medium flex gap-2 items-center hover:op-80">
          <span class="i-carbon-ai-status text-lg color-active" aria-hidden="true" />
          <span>Zero Player</span>
        </NuxtLink>
      </template>
      <template #end>
        <DarkToggle />
      </template>
    </LayoutToolbar>
    <main class="mx-auto px-4 py-6 max-w-6xl sm:px-6">
      <slot />
    </main>
  </div>
</template>
