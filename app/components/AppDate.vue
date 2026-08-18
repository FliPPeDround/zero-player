<script setup lang="ts">
import type { SeverityScale } from '@antfu/design/utils/format'
import DisplayDate from '@antfu/design/components/Display/DisplayDate.vue'

const props = withDefaults(defineProps<{
  date: number | string | Date
  /** Tint by age (freshness scale). */
  colorize?: boolean
  /** Custom severity thresholds forwarded to `DisplayDate`. */
  scale?: SeverityScale
  /** Update the relative label over time. */
  live?: boolean
  /** Update interval for the relative label. */
  interval?: number
}>(), {
  interval: 30_000,
})

const { timeAgo } = useAppI18n()

// `@antfu/design`'s `DisplayDate` renders English relative labels ("3 min ago");
// keep its colorize/scale/tooltip behavior but override the visible text with a
// localized label. Ticking mirrors `DisplayDate`: only when `live` is set.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

function startTicking(): void {
  if (timer || !import.meta.client)
    return
  timer = setInterval(() => {
    now.value = Date.now()
  }, props.interval)
}

function stopTicking(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

watch(() => props.live, value => (value ? startTicking() : stopTicking()), { immediate: true })
onBeforeUnmount(stopTicking)
</script>

<template>
  <DisplayDate
    :date="date"
    :colorize="colorize"
    :scale="scale"
    :live="live"
    :interval="interval"
  >
    {{ timeAgo(date, now) }}
  </DisplayDate>
</template>
