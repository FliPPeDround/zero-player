import { presetAnthonyDesign } from '@antfu/design/unocss'
import { createLocalFontProcessor } from '@unocss/preset-web-fonts/local'
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWebFonts,
  presetWind4,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  // Palette names passed to DisplayBadge/DisplayLabel as dynamic props are not
  // statically extractable, so the badge-color-* classes need a safelist.
  safelist: [
    'badge-color-primary',
    'badge-color-success',
    'badge-color-warning',
    'badge-color-error',
  ],
  shortcuts: [
    ['z-nav', 'z-[30]'],
    ['z-dropdown', 'z-[40]'],
    ['z-tooltip', 'z-[45]'],
    ['z-toast', 'z-[50]'],
    ['z-modal-backdrop', 'z-[60]'],
    ['z-modal-content', 'z-[70]'],
    ['z-drawer-backdrop', 'z-[80]'],
    ['z-drawer-content', 'z-[90]'],
  ],
  presets: [
    presetAnthonyDesign({
      primary: '#49833E',
    }),
    presetWind4(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
    }),
    presetTypography(),
    presetWebFonts({
      fonts: {
        sans: 'DM Sans',
        serif: 'DM Serif Display',
        mono: 'DM Mono',
      },
      processors: createLocalFontProcessor(),
    }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})
