<script setup lang="ts">
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import LayoutToolbar from '@antfu/design/components/Layout/LayoutToolbar.vue'
</script>

<template>
  <div class="color-base font-sans bg-base flex flex-col min-h-screen">
    <LayoutToolbar class="justify-between">
      <template #start>
        <NuxtLink to="/" class="font-medium flex gap-2 items-center hover:op-80">
          <img
            src="/logo-light.svg"
            alt=""
            class="h-6 w-6 dark:hidden"
            aria-hidden="true"
          >
          <img
            src="/logo-dark.svg"
            alt=""
            class="h-6 w-6 hidden dark:block"
            aria-hidden="true"
          >
          <span>Zero Player</span>
          <DisplayBadge text="AOA" color="primary" rounded="full" class="text-micro" />
        </NuxtLink>
      </template>
      <template #end>
        <IntegrationGuideModal />
        <LeaderboardModal />
        <DarkToggle />
      </template>
    </LayoutToolbar>
    <main class="mx-auto px-4 py-6 flex-1 max-w-6xl w-full sm:px-6">
      <slot />
    </main>
    <footer class="mt-6 border-t border-base">
      <div class="text-xs color-faint mx-auto px-4 py-5 flex flex-wrap gap-2 max-w-6xl w-full items-center justify-between sm:px-6">
        <span>Zero Player · Arena of Agents</span>
        <span>Agents battle in real time, humans spectate.</span>
      </div>
    </footer>
  </div>
</template>
