/**
 * Pure composition of the one self-contained task text a relay send gives a
 * command-line agent. Every run is fresh, so the text must carry the Brand
 * definition, the timeline read from disk, the earlier conversation, and the
 * Edit Request; nothing else reaches the child.
 *
 * @module @deepseek-ai/dsh-llm-motif-relay/task
 */

/** Brand definition text read from the Brand folder, absent when the Brand has none. */
export interface BrandDefinition {
  /** Exact file text, including whitespace the user wrote. */
  readonly text: string
}

/** One timeline file read from the Brand folder. */
export interface TimelineFile {
  /** Repository-independent path relative to the Brand folder, using `/` separators. */
  readonly path: string
  /** Exact file text. */
  readonly text: string
}

/** Deterministic digest of the conversation that precedes the Edit Request. */
export interface ConversationSummary {
  /** Digest lines, oldest first; empty when no earlier message remains in budget. */
  readonly text: string
  /** Earlier messages the digest budget dropped. */
  readonly omittedMessages: number
}

/** Everything one relay task text is built from. */
export interface RelayTaskInput {
  /** Latest user message in the Session, taken verbatim. */
  readonly editRequest: string
  /** Brand definition, or undefined when the Brand folder has no definition file. */
  readonly brand: BrandDefinition | undefined
  /** Timeline files in deterministic filename order. */
  readonly timelineFiles: readonly TimelineFile[]
  /** Digest of the earlier conversation. */
  readonly conversation: ConversationSummary
}

const MISSING_BRAND = '(the Brand folder has no brand definition file)'
const EMPTY_TIMELINE = '(the Brand folder has no timeline files)'
const FIRST_MESSAGE = '(this is the first message in this conversation)'

function withoutTrailingBlankLines(text: string): string {
  return text.replace(/[ \t]+$/gmu, '').replace(/\n+$/u, '')
}

function timelineSection(files: readonly TimelineFile[]): string {
  if (files.length === 0) return EMPTY_TIMELINE
  return files
    .map(file => `### ${file.path}\n${withoutTrailingBlankLines(file.text)}`)
    .join('\n\n')
}

function conversationSection(summary: ConversationSummary): string {
  const lines = withoutTrailingBlankLines(summary.text)
  if (lines.length === 0) return FIRST_MESSAGE
  const omitted = summary.omittedMessages === 0
    ? ''
    : `\n(${summary.omittedMessages} earlier messages are out of budget.)`
  return `${lines}${omitted}`
}

/**
 * Build the exact task text for one fresh command-line agent run.
 *
 * The result depends only on its input: no clock, environment, or path outside
 * the Brand folder reaches it, so a replayed input yields byte-identical text.
 * @param input - Edit Request, Brand definition, timeline files, and conversation digest.
 * @returns the complete task text, ending with exactly one newline.
 */
export function buildRelayTask(input: RelayTaskInput): string {
  const editRequest = withoutTrailingBlankLines(input.editRequest).trim()
  const brand = input.brand === undefined
    ? MISSING_BRAND
    : withoutTrailingBlankLines(input.brand.text)
  const sections = [
    'Complete one video-edit request for a Brand. The current directory is the Brand folder.',
    '',
    '## Brand definition',
    brand,
    '',
    '## Timeline',
    timelineSection(input.timelineFiles),
    '',
    '## Earlier conversation',
    conversationSection(input.conversation),
    '',
    '## Edit Request',
    editRequest,
    '',
    'Apply the Edit Request to the Source Video under this Brand, write the result into the Brand folder, and finish with a short answer describing what changed.',
  ]
  return `${sections.join('\n')}\n`
}
