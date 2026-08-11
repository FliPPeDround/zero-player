import process from 'node:process'

import { mcpDescription, mcpInstructions } from './app/config/mcp'
import { pwa } from './app/config/pwa'
import { appDescription } from './app/constants/index'

const isCloudflareBuild = process.env.WORKERS_CI_BRANCH !== undefined
  || process.env.NITRO_PRESET?.includes('cloudflare')
const cloudflareDatabaseId = process.env.NUXT_HUB_CLOUDFLARE_DATABASE_ID || process.env.CLOUDFLARE_DATABASE_ID || 'e657e3d5-08c4-44c0-88e4-5ebe3b81b84d'
const cloudflareKvNamespaceId = process.env.NUXT_HUB_CLOUDFLARE_KV_ID || process.env.CLOUDFLARE_KV_ID || 'cae1f88741154b8bacc6ef00f674b716'

if (isCloudflareBuild && !cloudflareDatabaseId) {
  console.warn('[nuxt:hub] Missing NUXT_HUB_CLOUDFLARE_DATABASE_ID (or CLOUDFLARE_DATABASE_ID) build-time variable: the D1 `DB` binding will not be generated.')
}
if (isCloudflareBuild && !cloudflareKvNamespaceId) {
  console.warn('[nuxt:hub] Missing NUXT_HUB_CLOUDFLARE_KV_ID (or CLOUDFLARE_KV_ID) build-time variable: the KV `KV` binding will not be generated.')
}

export default defineNuxtConfig({
  modules: [
    '@vueuse/nuxt',
    '@unocss/nuxt',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@vite-pwa/nuxt',
    '@nuxt/eslint',
    '@nuxthub/core',
    '@nuxtjs/mcp-toolkit',
    'floating-vue/nuxt',
  ],

  devtools: {
    enabled: true,
  },

  app: {
    head: {
      viewport: 'width=device-width,initial-scale=1',
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/svg+xml', href: '/nuxt.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: appDescription },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: 'white' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#222222' },
      ],
    },
  },

  css: [
    '@unocss/reset/tailwind.css',
    '@antfu/design/styles.css',
  ],

  colorMode: {
    classSuffix: '',
  },

  future: {
    compatibilityVersion: 4,
  },

  experimental: {
    // when using generate, payload js assets included in sw precache manifest
    // but missing on offline, disabling extraction it until fixed
    payloadExtraction: false,
    renderJsonPayloads: true,
    typedPages: true,
  },

  compatibilityDate: '2024-09-19',

  nitro: {
    cloudflare: {
      wrangler: {
        durable_objects: {
          bindings: [
            { name: '$DurableObject', class_name: '$DurableObject' },
          ],
        },
        migrations: [
          { tag: 'v1', new_sqlite_classes: ['$DurableObject'] },
        ],
        routes: [
          { pattern: 'zeroplayer.space', custom_domain: true },
          { pattern: 'www.zeroplayer.space', custom_domain: true },
        ],
      },
    },
    scheduledTasks: {
      '*/1 * * * *': ['rooms:cleanup'],
    },
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    prerender: {
      crawlLinks: false,
      routes: ['/'],
      ignore: ['/hi'],
    },
    experimental: {
      tasks: true,
      websocket: true,
      asyncContext: true,
    },
    preset: 'cloudflare-durable',
  },

  hub: {
    // Cloudflare Workers builds need explicit resource IDs, otherwise
    // NuxtHub cannot generate the `KV` / `DB` bindings in
    // `.output/server/wrangler.json`. Set these in the build environment:
    //   - NUXT_HUB_CLOUDFLARE_KV_ID (KV namespace ID)
    //   - NUXT_HUB_CLOUDFLARE_DATABASE_ID (D1 database ID)
    // `CLOUDFLARE_KV_ID` / `CLOUDFLARE_DATABASE_ID` are accepted as aliases.
    kv: isCloudflareBuild
      ? {
          driver: 'cloudflare-kv-binding',
          binding: 'KV',
          namespaceId: cloudflareKvNamespaceId || '',
        }
      : true,
    // SQLite in local dev (`.data/db/sqlite.db`), D1 on Cloudflare deploy.
    // Used to archive finished games as a public AI dataset.
    db: isCloudflareBuild
      ? {
          dialect: 'sqlite',
          driver: 'd1',
          connection: {
            databaseId: cloudflareDatabaseId || '',
          },
          applyMigrationsDuringBuild: false,
        }
      : 'sqlite',
  },

  eslint: {
    config: {
      standalone: false,
      nuxt: {
        sortConfigKeys: true,
      },
    },
  },

  mcp: {
    name: 'Zero Player',
    description: mcpDescription,
    instructions: mcpInstructions,
    // Identity is carried by the short token returned from `login` and echoed
    // in every tool response, so MCP sessions are never needed — Node and
    // Cloudflare both serve stateless JSON transports. The existing Cloudflare
    // provider patch remains required for that runtime.
    sessions: false,
  },

  pwa,
})
