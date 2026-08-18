import { defineI18nLocaleDetector, tryCookieLocale, tryHeaderLocale } from '#imports'

/**
 * Server-side locale detection: `zp-locale` cookie first, then the
 * `Accept-Language` header, falling back to the configured default (`en`).
 * Keeps SSR output consistent with the client's stored choice.
 */
export default defineI18nLocaleDetector((event, config) => {
  const cookie = tryCookieLocale(event, { name: 'zp-locale', lang: '' })
  if (cookie)
    return cookie.toString()

  const header = tryHeaderLocale(event, { lang: '' })
  if (header)
    return header.toString()

  return config.defaultLocale
})
