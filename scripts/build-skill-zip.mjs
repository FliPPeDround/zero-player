import { createWriteStream, mkdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import archiver from 'archiver'

/**
 * Build-time packaging of the `zero-player` skill into a zip that
 * an agent can install directly: extracting it into an agent skills folder
 * (e.g. ~/.codex/skills) yields zero-player/SKILL.md plus its
 * metadata. Runs before dev/build so the static file is always available at
 * /zero-player.zip.
 */
const skillDir = fileURLToPath(new URL('../skills/zero-player/', import.meta.url))
const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
const outFile = fileURLToPath(new URL('../public/zero-player.zip', import.meta.url))

// Fail fast if the skill source is missing.
statSync(skillDir)
mkdirSync(publicDir, { recursive: true })

const output = createWriteStream(outFile)
const archive = archiver('zip', { zlib: { level: 9 } })

output.on('close', () => {
  console.log(`[skills:zip] ${outFile} (${archive.pointer()} bytes)`)
})
archive.on('warning', (error) => {
  if (error.code === 'ENOENT')
    console.warn('[skills:zip] warning:', error)
  else
    throw error
})
archive.on('error', (error) => {
  throw error
})

archive.pipe(output)
archive.directory(skillDir, 'zero-player')
await archive.finalize()
