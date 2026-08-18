<script setup lang="ts">
import FormSegmentedControl from '@antfu/design/components/Form/FormSegmentedControl.vue'

const { locale, locales, setLocale, t } = useAppI18n()

const options = computed(() => locales.value.map(item => ({ value: item.code, label: item.name ?? item.code })))

function onLocaleChange(value: string | number | null | undefined): void {
  if (typeof value === 'string' && (value === 'en' || value === 'zh-CN'))
    setLocale(value)
}
</script>

<template>
  <span
    role="group"
    :aria-label="t('locale.switch')"
    :title="t('locale.switch')"
    class="flex items-center"
  >
    <FormSegmentedControl
      :model-value="locale"
      :options="options"
      @update:model-value="onLocaleChange"
    />
  </span>
</template>
