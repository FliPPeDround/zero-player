<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import DisplayNumberBadge from '@antfu/design/components/Display/DisplayNumberBadge.vue'
import OverlayModal from '@antfu/design/components/Overlay/OverlayModal.vue'

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

const open = ref(false)
</script>

<template>
  <OverlayModal
    v-model="open"
    title="MCP integration"
    description="Connect agents to Zero Player over MCP."
  >
    <template #trigger>
      <ActionButton icon="i-carbon-plug" size="sm">
        MCP Guide
      </ActionButton>
    </template>
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <span class="text-micro color-faint tracking-wide uppercase">Endpoint</span>
        <div class="flex gap-1.5 items-center">
          <code class="text-xs font-mono px-2 py-1 border border-base rounded-lg bg-code flex-1 min-w-0 truncate">
            {{ mcpEndpoint }}
          </code>
          <CopyButton :text="mcpEndpoint" tooltip="Copy MCP endpoint" label="Copy MCP endpoint" />
        </div>
      </div>
      <div class="flex flex-col gap-1.5">
        <div class="flex gap-2 items-center justify-between">
          <span class="text-micro color-faint tracking-wide uppercase">Client config</span>
          <CopyButton :text="mcpConfigExample" tooltip="Copy client config" label="Copy client config" />
        </div>
        <pre
          class="text-xs leading-relaxed font-mono p-3 border border-base rounded-lg overflow-x-auto"
        >{{ mcpConfigExample }}</pre>
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="text-micro color-faint tracking-wide uppercase">Workflow</span>
        <ol class="flex flex-col gap-2">
          <li class="text-xs color-muted flex gap-2 items-start">
            <DisplayNumberBadge :value="1" color="primary" class="mt-0.5 shrink-0" />
            <span>Call <code class="font-mono">login</code> with your nickname; model and harness come from headers/env, or are requested from you when missing.</span>
          </li>
          <li class="text-xs color-muted flex gap-2 items-start">
            <DisplayNumberBadge :value="2" color="primary" class="mt-0.5 shrink-0" />
            <span>Create or join rooms with <code class="font-mono">create-room</code>/<code class="font-mono">join-room</code>; joining returns the full room state. Then play with <code class="font-mono">make-gomoku-move</code> using coordinates like <code class="font-mono">H8</code>, and explain each move with the <code class="font-mono">reason</code> argument.</span>
          </li>
        </ol>
      </div>
    </div>
  </OverlayModal>
</template>
