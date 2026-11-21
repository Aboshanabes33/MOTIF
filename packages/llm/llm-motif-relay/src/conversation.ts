/**
 * Deterministic conversation digest and Edit Request selection for a relay
 * send. The command-line agent never sees the Session, so the earlier turns
 * enter the task only through this fixed-budget text.
 *
 * @module @deepseek-ai/dsh-llm-motif-relay/conversation
 */

import type { RequestMessage } from '@deepseek-ai/dsh-llm'
import { extractTextContent } from '@deepseek-ai/dsh-llm/message'
import type { ConversationSummary } from './task.ts'

/** Budget applied to the earlier conversation carried into one relay task. */
export interface ConversationBudget {
  /** Earlier messages kept, newest last; the current Edit Request never counts. */
  readonly maxMessages: number
  /** Characters kept across the retained messages; the oldest text is removed first. */
  readonly maxChars: number
}

interface ConversationLine {
  readonly label: 'User' | 'Assistant'
  readonly text: string
}

/**
 * Whether one message carries the user's own words rather than a runtime
 * reminder injected beside them. Runtime contributions reuse the user role,
 * so the source tag is the only reliable distinction.
 */
function isUserAuthored(message: RequestMessage): boolean {
  if (message.role !== 'user') return false
  return !('source' in message) || message.source === undefined || message.source.kind === 'user'
}

function conversationLine(message: RequestMessage): ConversationLine | undefined {
  if (message.role !== 'user' && message.role !== 'assistant') return undefined
  if (message.role === 'user' && !isUserAuthored(message)) return undefined
  const text = extractTextContent(message.content).trim()
  if (text.length === 0) return undefined
  return { label: message.role === 'user' ? 'User' : 'Assistant', text }
}

/**
 * Locate the Edit Request that started this relay call.
 * @param messages - assembled conversation messages, oldest first.
 * @returns the last non-blank user text, or undefined when the request carries no user text.
 */
export function latestEditRequest(messages: readonly RequestMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message === undefined || message.role !== 'user' || !isUserAuthored(message)) continue
    const line = conversationLine(message)
    if (line !== undefined) return line.text
  }
  return undefined
}

/**
 * Summarize the conversation that precedes the Edit Request within fixed budgets.
 *
 * The newest messages survive first, so a follow-up keeps the answer it
 * depends on. Messages dropped by either budget are counted, never silently
 * lost from the report.
 * @param messages - assembled conversation messages, oldest first.
 * @param budget - retained message count and character budget.
 * @returns digest lines plus the number of earlier messages the budget dropped.
 */
export function conversationSummary(
  messages: readonly RequestMessage[],
  budget: ConversationBudget,
): ConversationSummary {
  const lines: ConversationLine[] = []
  const editRequest = latestEditRequest(messages)
  let editIndex = -1
  if (editRequest !== undefined) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message !== undefined && isUserAuthored(message) && conversationLine(message) !== undefined) {
        editIndex = index
        break
      }
    }
  }
  const earlier = editIndex < 0 ? messages : messages.slice(0, editIndex)
  for (const message of earlier) {
    const line = conversationLine(message)
    if (line !== undefined) lines.push(line)
  }

  let omittedMessages = Math.max(0, lines.length - budget.maxMessages)
  let kept = lines.slice(Math.max(0, lines.length - budget.maxMessages))
  const render = (): string => kept.map(line => `${line.label}: ${line.text}`).join('\n')
  let text = render()
  while (kept.length > 1 && text.length > budget.maxChars) {
    kept = kept.slice(1)
    omittedMessages += 1
    text = render()
  }
  if (text.length > budget.maxChars) {
    text = `…${text.slice(text.length - budget.maxChars + 1)}`
  }
  return { text, omittedMessages }
}
