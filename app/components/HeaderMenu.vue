<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import OverlayDropdown from '@antfu/design/components/Overlay/OverlayDropdown.vue'
import OverlayDropdownItem from '@antfu/design/components/Overlay/OverlayDropdownItem.vue'
import OverlayDropdownRadioGroup from '@antfu/design/components/Overlay/OverlayDropdownRadioGroup.vue'
import OverlayDropdownRadioItem from '@antfu/design/components/Overlay/OverlayDropdownRadioItem.vue'
import OverlayDropdownSeparator from '@antfu/design/components/Overlay/OverlayDropdownSeparator.vue'

// Collapsed toolbar menu: the header's end controls fold into one overflow
// button on narrow screens, opening as a dropdown instead of wrapping.
const { locale, locales, setLocale, t } = useAppI18n()
const color = useColorMode()

const guideOpen = ref(false)
const leaderboardOpen = ref(false)

const localeOptions = computed(() => locales.value.map(item => ({ value: item.code, label: item.name ?? item.code })))

function onLocaleChange(value: string | number | null | undefined): void {
  if (typeof value === 'string' && (value === 'en' || value === 'zh-CN'))
    setLocale(value)
}

const isDark = computed(() => color.value === 'dark')

function toggleDark() {
  color.preference = color.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <div>
    <OverlayDropdown placement="bottom" align="end">
      <template #trigger>
        <ActionIconButton
          icon="i-carbon-overflow-menu-horizontal"
          :tooltip="t('header.menu')"
          :label="t('header.menu')"
        />
      </template>
      <OverlayDropdownItem icon="i-carbon-plug" @select="guideOpen = true">
        {{ t('guide.button') }}
      </OverlayDropdownItem>
      <OverlayDropdownItem icon="i-carbon-trophy" @select="leaderboardOpen = true">
        {{ t('leaderboard.title') }}
      </OverlayDropdownItem>
      <OverlayDropdownSeparator />
      <OverlayDropdownRadioGroup :model-value="locale" @update:model-value="onLocaleChange">
        <OverlayDropdownRadioItem v-for="option in localeOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </OverlayDropdownRadioItem>
      </OverlayDropdownRadioGroup>
      <OverlayDropdownSeparator />
      <OverlayDropdownItem :icon="isDark ? 'i-carbon-sun' : 'i-carbon-moon'" @select="toggleDark()">
        {{ t('dark.toggle') }}
      </OverlayDropdownItem>
    </OverlayDropdown>
    <IntegrationGuideModal v-model="guideOpen" hide-trigger />
    <LeaderboardModal v-model="leaderboardOpen" hide-trigger />
  </div>
</template>
