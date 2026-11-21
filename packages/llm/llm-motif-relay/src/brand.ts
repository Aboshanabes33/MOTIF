/**
 * Brand-folder reads for one relay send. Reads happen per send rather than at
 * Session start, so a manual edit inside the Brand folder is part of the very
 * next task text.
 *
 * @module @deepseek-ai/dsh-llm-motif-relay/brand
 */

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrandDefinition, TimelineFile } from './task.ts'

/** Where a Brand keeps its definition and timeline, and how much of the timeline one task may carry. */
export interface BrandFileConfig {
  /** Definition file path relative to the Brand folder. */
  readonly brandFile: string
  /** Timeline directory relative to the Brand folder. */
  readonly timelineDir: string
  /** File extensions accepted from the timeline directory, including the dot. */
  readonly timelineExtensions: readonly string[]
  /** Timeline files carried by one task; the remainder are skipped in filename order. */
  readonly maxTimelineFiles: number
  /** Total timeline text bytes carried by one task. */
  readonly maxTimelineBytes: number
}

/** One Brand folder as read for a single relay send. */
export interface BrandSnapshot {
  /** Definition text, absent when the file does not exist. */
  readonly definition: BrandDefinition | undefined
  /** Timeline files in filename order. */
  readonly timelineFiles: readonly TimelineFile[]
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT'
}

async function readOptionalText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error: unknown) {
    if (isMissing(error)) return undefined
    throw error
  }
}

function acceptedExtension(name: string, extensions: readonly string[]): boolean {
  return extensions.some(extension => name.endsWith(extension))
}

/**
 * Read one Brand folder for a relay task.
 *
 * A missing definition file or timeline directory is a normal fresh Brand and
 * contributes nothing. Any other filesystem failure surfaces as a relay
 * failure instead of a silently thinner task.
 * @param brandRoot - absolute Brand folder path.
 * @param config - definition and timeline file rules.
 * @returns the definition, when present, and the timeline within budget.
 */
export async function readBrandSnapshot(
  brandRoot: string,
  config: BrandFileConfig,
): Promise<BrandSnapshot> {
  const definitionText = await readOptionalText(join(brandRoot, config.brandFile))
  const definition = definitionText === undefined ? undefined : { text: definitionText }

  let names: string[]
  try {
    const entries = await readdir(join(brandRoot, config.timelineDir), { withFileTypes: true })
    names = entries
      .filter(entry => entry.isFile() && acceptedExtension(entry.name, config.timelineExtensions))
      .map(entry => entry.name)
      .sort()
  } catch (error: unknown) {
    if (isMissing(error)) return { definition, timelineFiles: [] }
    throw error
  }

  const timelineFiles: TimelineFile[] = []
  let budget = config.maxTimelineBytes
  for (const name of names) {
    if (timelineFiles.length >= config.maxTimelineFiles) break
    const text = await readFile(join(brandRoot, config.timelineDir, name), 'utf8')
    const bytes = Buffer.byteLength(text, 'utf8')
    if (bytes > budget) break
    budget -= bytes
    timelineFiles.push({ path: `${config.timelineDir}/${name}`, text })
  }
  return { definition, timelineFiles }
}
