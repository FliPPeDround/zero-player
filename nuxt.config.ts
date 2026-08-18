import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

import { mcpDescription, mcpInstructions } from './app/config/mcp'
import { pwa } from './app/config/pwa'
import { appDescription } from './app/constants/index'

const libsqlTraceIncludes = ['darwin-arm64', 'linux-x64-gnu', 'linux-x64-musl']
  .map(name => resolve(process.cwd(), `node_modules/@libsql/${name}`))
  .filter(dir => existsSync(dir))
  .flatMap(dir => [resolve(dir, 'package.json'), resolve(dir, 'index.node')])

// NuxtHub generates a lazy DB client when no connection URL is provided, so
// the SQLite file is only opened after the startup migration plugin creates
// `.data/db`. This default keeps local dev working without a .env file.
process.env.DATABASE_URL ||= 'file:.data/db/sqlite.db'

export default defineNuxtConfig({
  modules: [
    '@vueuse/nuxt',
    '@unocss/nuxt',
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
        { rel: 'icon', href: '/favicon-dark.svg', type: 'image/svg+xml', media: '(prefers-color-scheme: dark)' },
        { rel: 'icon', href: '/favicon-light.svg', type: 'image/svg+xml', media: '(prefers-color-scheme: light)' },
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
    '~/assets/css/overrides.css',
  ],

  colorMode: {
    classSuffix: '',
  },
  devServer: {
    port: 3000,
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
    preset: 'node-server',
    externals: {
      // Keep the libsql native binary in the traced server output; without it
      // Nitro copies only the package metadata and the server fails to load.
      traceInclude: libsqlTraceIncludes,
    },
    scheduledTasks: {
      '*/5 * * * *': ['rooms:cleanup'],
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
  },

  hub: {
    // Local single-server storage: file-backed KV and SQLite.
    kv: {
      driver: 'fs-lite',
      base: '.data/kv',
    },
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      connection: {},
      applyMigrationsDuringBuild: false,
      applyMigrationsDuringDev: true,
    },
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
    // in every tool response, so MCP sessions are never needed — Node serves
    // stateless JSON transports.
    sessions: false,
  },

  pwa,
})
