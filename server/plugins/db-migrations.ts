import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { sql } from 'drizzle-orm'

const MIGRATION_TABLE = '_hub_migrations'
const MIGRATION_BREAK = '--> statement-breakpoint'
const SQL_SUFFIX = /\.sql$/

process.env.DATABASE_URL ||= 'file:.data/db/sqlite.db'

function resolveMigrationsDir(): string {
  if (process.env.MIGRATIONS_DIR)
    return resolve(process.env.MIGRATIONS_DIR)
  const bundled = resolve(process.cwd(), '.output/server/db/migrations/sqlite')
  const source = resolve(process.cwd(), 'server/db/migrations/sqlite')
  return existsSync(bundled) ? bundled : source
}

/**
 * Production-only startup migration runner.
 *
 * NuxtHub applies migrations automatically during `nuxt dev` and, when
 * enabled, during `nuxt build`. Docker production images do not ship the
 * Nuxt CLI, so this plugin replays the same SQL migrations from the bundled
 * `.output/server/db/migrations/sqlite` directory and tracks them in the
 * NuxtHub-compatible `_hub_migrations` table.
 */
export default defineNitroPlugin(async () => {
  // Dev has NuxtHub's own migration plugin; prerender/build must not touch the
  // runtime database. Only the running Node server applies migrations.
  if (import.meta.dev || import.meta.prerender)
    return

  const migrationsDir = resolveMigrationsDir()
  if (!existsSync(migrationsDir))
    throw new Error(`[db] Migrations directory not found: ${migrationsDir} (set MIGRATIONS_DIR to override)`)

  const dataDir = resolve(process.cwd(), '.data')
  await mkdir(join(dataDir, 'db'), { recursive: true })
  await mkdir(join(dataDir, 'kv'), { recursive: true })

  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`))

  const appliedRows = await db.run(sql.raw(`SELECT name FROM ${MIGRATION_TABLE}`))
  const applied = new Set(
    (appliedRows.rows as unknown as Array<{ name: unknown }>).map(row => String(row.name)),
  )

  const files = (await readdir(migrationsDir))
    .filter(file => file.endsWith('.sql'))
    .sort()

  for (const file of files) {
    if (applied.has(file) || applied.has(file.replace(SQL_SUFFIX, '')))
      continue

    const content = await readFile(join(migrationsDir, file), 'utf8')
    for (const rawStatement of content.split(MIGRATION_BREAK)) {
      const statement = rawStatement.trim()
      if (statement)
        await db.run(sql.raw(statement))
    }

    await db.run(sql.raw(`INSERT INTO ${MIGRATION_TABLE} (name) VALUES ('${file}')`))
    console.warn(`[db] Applied migration ${file}`)
  }
})
