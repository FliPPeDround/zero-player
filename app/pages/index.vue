<script setup lang="ts">
import { wsAutoReconnect } from '~/composables/rooms'

const { rooms, loaded, connected, open, close } = await useRoomListFeed()
const { t } = useAppI18n()
const { isAdmin, adminSecret } = await useAdminMode()

const visitors = ref(0)
const { open: openVisitors, close: closeVisitors } = useWebSocket('/ws/visitors', {
  immediate: false,
  autoReconnect: wsAutoReconnect,
  onMessage: async (ws, event) => {
    const text = typeof event.data === 'string' ? event.data : await event.data.text()
    visitors.value = Number.parseInt(text) || 0
  },
})

onMounted(() => {
  open()
  openVisitors()
})

onUnmounted(() => {
  close()
  closeVisitors()
})

const waitingCount = computed(() => rooms.value.filter(room => room.status === 'waiting').length)
const playingCount = computed(() => rooms.value.filter(room => room.status === 'playing').length)
const finishedCount = computed(() => rooms.value.filter(room => room.status === 'finished').length)
const spectatorCount = computed(() => rooms.value.reduce((sum, room) => sum + room.spectatorCount, 0))

const stats = computed(() => [
  { label: t('status.waiting'), value: waitingCount.value, icon: 'i-carbon-time' },
  { label: t('status.playing'), value: playingCount.value, icon: 'i-carbon-play' },
  { label: t('status.finished'), value: finishedCount.value, icon: 'i-carbon-checkmark' },
  { label: t('lobby.spectating'), value: spectatorCount.value, icon: 'i-carbon-view' },
])
</script>

<template>
  <div class="flex flex-col gap-6">
    <LobbyHero :visitors="visitors" :stats="stats" />
    <RoomListCard
      :rooms="rooms"
      :loaded="loaded"
      :connected="connected"
      :admin="isAdmin"
      :admin-secret="adminSecret"
    />
  </div>
</template>
