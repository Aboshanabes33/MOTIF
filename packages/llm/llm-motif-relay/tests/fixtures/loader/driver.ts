#!/usr/bin/env node
/** Boot the shipped headless profile with the relay route and drive real turns. */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { runFixtureTurn } from '@deepseek-ai/dsh-loader-smoke'
import type {} from '@deepseek-ai/dsh-llm-motif-relay'
import { bootProductionProfile } from '../../../../../test-support/loader-smoke/tests/fixtures/production-profile.ts'

const [configPath, tasksJson] = process.argv.slice(2)
if (configPath === undefined || tasksJson === undefined) {
  throw new Error('motif-relay driver expects <config-path> <tasks-json>')
}
const tasks = JSON.parse(tasksJson) as string[]

const workdir = await mkdtemp(join(tmpdir(), 'motif-relay-driver-'))
const brandRoot = join(workdir, 'brand')
const configDir = join(workdir, 'claude')
const promptsFile = join(workdir, 'prompts.jsonl')
mkdirSync(join(brandRoot, 'timeline'), { recursive: true })
mkdirSync(configDir, { recursive: true })
writeFileSync(join(brandRoot, 'brand.md'), 'Primary color: #1d4ed8\nFont: Inter Tight\n')
writeFileSync(join(brandRoot, 'timeline', 'main.json'), '{"clips":[{"start":0,"end":30}]}')
writeFileSync(join(configDir, '.credentials.json'), '{"token":"fixture"}')
writeFileSync(promptsFile, '')
process.env['MOTIF_RELAY_BRAND'] = brandRoot
process.env['MOTIF_RELAY_PROMPTS_FILE'] = promptsFile
process.env['CLAUDE_CONFIG_DIR'] = configDir

const statuses: string[] = []
const ctx = await bootProductionProfile({
  binName: 'motif-relay-loader-composition',
  profile: 'headless',
  overlayPaths: [resolveConfigPath(configPath, undefined)],
  prepare: (host) => {
    host.on('motif-relay/status', (event) => { statuses.push(`${event.backend}:${event.status}`) })
  },
})

const cancelAfterMs = Number(process.env['MOTIF_RELAY_CANCEL_AFTER_MS'] ?? '0')

try {
  const turns: { output: string }[] = []
  for (const [index, task] of tasks.entries()) {
    if (index > 0) {
      // A manual timeline edit between sends must reach the next task text.
      writeFileSync(join(brandRoot, 'timeline', 'main.json'), '{"clips":[{"start":0,"end":4}]}')
    }
    if (index === 0 && Number.isFinite(cancelAfterMs) && cancelAfterMs > 0) {
      const root = ctx.agents.list()[0]
      setTimeout(() => { root?.cancel({ kind: 'user' }) }, cancelAfterMs)
    }
    const result = await runFixtureTurn(ctx, { task })
    turns.push({ output: result.output })
  }
  const prompts = readFileSync(promptsFile, 'utf8')
    .trim()
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => (JSON.parse(line) as { prompt: string }).prompt)
  process.stdout.write(`${JSON.stringify({ turns, prompts, statuses })}\n`)
} finally {
  await ctx.fiber.dispose()
  await rm(workdir, { recursive: true, force: true })
}
