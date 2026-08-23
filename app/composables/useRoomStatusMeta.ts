// @unocss-include
import type { RoomStatus } from '#shared/rooms'

export interface RoomStatusMeta {
  label: string
  color: string | false
  icon: string
  progress: string
}

/**
 * Shared visual mapping for a room status, so the lobby cards and the room
 * page header render the same label, badge color, icon, and progress color.
 */
export function useRoomStatusMeta(status: MaybeRefOrGetter<RoomStatus>) {
  const { t } = useAppI18n()

  return computed<RoomStatusMeta>(() => {
    switch (toValue(status)) {
      case 'waiting':
        return {
          label: t('status.waiting'),
          color: 'warning',
          icon: 'i-carbon-time',
          progress: 'bg-warning-500',
        }
      case 'playing':
        return {
          label: t('status.playing'),
          color: 'success',
          icon: 'i-carbon-play',
          progress: 'bg-success-500',
        }
      case 'finished':
        return {
          label: t('status.finished'),
          color: false,
          icon: 'i-carbon-checkmark',
          progress: 'bg-hover',
        }
      case 'aborted':
        return {
          label: t('status.aborted'),
          color: 'error',
          icon: 'i-carbon-stop-outline',
          progress: 'bg-error-500',
        }
    }
  })
}
