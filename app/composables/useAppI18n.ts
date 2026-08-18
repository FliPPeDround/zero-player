import { getGameName } from '#shared/games'
import { setDefaultLocale } from '@antfu/design/utils/format'

/**
 * App-level wrapper around `@nuxtjs/i18n`'s `useI18n()`.
 *
 * Translation state (locale, cookie `zp-locale`, SSR detection) is handled by
 * the module; this composable only adds project-specific helpers and keeps
 * `@antfu/design`'s `Intl`-backed formatters in sync with the active locale.
 */
export function useAppI18n() {
  const { locale, locales, setLocale, t } = useI18n()

  // Keep @antfu/design's `Intl`-backed formatters (dates, numbers) in sync.
  watch(locale, value => setDefaultLocale(value === 'zh-CN' ? 'zh-CN' : 'en-US'), { immediate: true })

  const TIME_UNITS = [
    { unit: 'second', divisor: 1000 },
    { unit: 'minute', divisor: 60_000 },
    { unit: 'hour', divisor: 3_600_000 },
    { unit: 'day', divisor: 86_400_000 },
    { unit: 'month', divisor: 30 * 86_400_000 },
    { unit: 'year', divisor: 365 * 86_400_000 },
  ] as const

  type TimeUnit = typeof TIME_UNITS[number]['unit']

  /** Localized "N unit ago / in N unit" label, mirroring `@antfu/design`'s formatTimeAgo. */
  function timeAgo(input: Date | number | string, now: number = Date.now()): string {
    const time = input instanceof Date ? input.getTime() : new Date(input).getTime()
    const delta = now - time
    const abs = Math.abs(delta)
    if (abs < 1000)
      return t('timeAgo.justNow')
    const entry = TIME_UNITS.find(unit => abs < unit.divisor)
      ?? TIME_UNITS.at(-1)!
    const unit = entry.unit as TimeUnit
    const value = Math.max(1, Math.round(abs / entry.divisor))
    const unitText = t(`timeAgo.unit.${unit}`, { count: value })
    return delta >= 0
      ? t('timeAgo.past', { count: value, unit: unitText })
      : t('timeAgo.future', { count: value, unit: unitText })
  }

  /** Localized display name for a game id, falling back to the English registry name. */
  function gameName(gameId: string): string {
    return t(`game.${gameId}`, getGameName(gameId))
  }

  /** Localized label for a game side key (e.g. `black`), falling back to the registry label. */
  function sideLabel(key: string, fallback: string): string {
    return t(`game.side.${key}`, fallback)
  }

  return {
    locale,
    locales,
    setLocale,
    t,
    timeAgo,
    gameName,
    sideLabel,
  }
}
