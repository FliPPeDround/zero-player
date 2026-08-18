<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import OverlayModal from '@antfu/design/components/Overlay/OverlayModal.vue'
import { highlight } from 'sugar-high'
import skillMarkdown from '../../skills/zero-player/SKILL.md?raw'

const requestUrl = useRequestURL()
const mcpEndpoint = computed(() => `${requestUrl.origin}/mcp`)
const mcpConfigExample = computed(() => `{
  "mcpServers": {
    "zero-player": {
      "type": "http",
      "url": "${mcpEndpoint.value}"
    }
  }
}`)
const mcpConfigHtml = computed(() => highlight(mcpConfigExample.value, { lang: 'json' }))

const open = ref(false)
const { t } = useAppI18n()
</script>

<template>
  <OverlayModal
    v-model="open"
    :title="t('guide.title')"
    :description="t('guide.description')"
  >
    <template #trigger>
      <ActionButton icon="i-carbon-plug" size="sm">
        {{ t('guide.button') }}
      </ActionButton>
    </template>
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <span class="text-micro color-faint tracking-wide uppercase">{{ t('guide.endpoint') }}</span>
        <div class="flex gap-1.5 items-center">
          <code class="text-xs font-mono px-2 py-1 border border-base rounded-lg bg-code flex-1 min-w-0 truncate">
            {{ mcpEndpoint }}
          </code>
          <CopyButton
            :text="mcpEndpoint"
            :tooltip="t('guide.copyEndpoint')"
            :label="t('guide.copyEndpoint')"
          />
        </div>
      </div>
      <div class="flex flex-col gap-1.5">
        <div class="flex gap-2 items-center justify-between">
          <span class="text-micro color-faint tracking-wide uppercase">{{ t('guide.clientConfig') }}</span>
          <CopyButton
            :text="mcpConfigExample"
            :tooltip="t('guide.copyClientConfig')"
            :label="t('guide.copyClientConfig')"
          />
        </div>
        <pre
          class="sh-code text-xs leading-relaxed font-mono p-3 border border-base rounded-lg overflow-x-auto"
        ><code v-html="mcpConfigHtml" /></pre>
      </div>
      <div class="flex flex-col gap-1.5">
        <div class="flex gap-2 items-center justify-between">
          <span class="text-micro color-faint tracking-wide uppercase">{{ t('guide.agentSkill') }}</span>
          <div class="flex gap-1.5 items-center">
            <CopyButton
              :text="skillMarkdown"
              :tooltip="t('guide.copySkill')"
              :label="t('guide.copySkill')"
            />
            <DownloadButton
              url="/zero-player.zip"
              :tooltip="t('guide.downloadSkill')"
              :label="t('guide.downloadSkill')"
            />
          </div>
        </div>
        <pre
          class="text-xs leading-relaxed font-mono p-3 border border-base rounded-lg max-h-80 whitespace-pre-wrap break-words overflow-auto"
        >{{ skillMarkdown }}</pre>
      </div>
    </div>
  </OverlayModal>
</template>

<style>
.sh-code {
  --sh-class: #2d5e9d;
  --sh-identifier: #354150;
  --sh-sign: #8996a3;
  --sh-property: #0550ae;
  --sh-entity: #249a97;
  --sh-jsxliterals: #6266d1;
  --sh-string: #00a99a;
  --sh-keyword: #f47067;
  --sh-comment: #a19595;
}

html.dark .sh-code {
  --sh-class: #ffa657;
  --sh-identifier: #e6edf3;
  --sh-sign: #8b949e;
  --sh-property: #79c0ff;
  --sh-entity: #7ee787;
  --sh-jsxliterals: #d2a8ff;
  --sh-string: #a5d6ff;
  --sh-keyword: #ff7b72;
  --sh-comment: #8b949e;
}
</style>
