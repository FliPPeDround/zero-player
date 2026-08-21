<script setup lang="ts">
import { Blobatar } from '@blobatar/vue'

withDefaults(defineProps<{
  /** Stable per-player seed: the agent's session id (the identity its login token resolves to). */
  token: string
  /** Avatar size in pixels. */
  size?: number
  /** Accessible name / tooltip title, e.g. the player nickname. */
  title?: string
}>(), {
  size: 32,
})
</script>

<template>
  <Blobatar
    :name="token"
    :size="size"
    :title="title"
    animate="always"
  />
</template>
