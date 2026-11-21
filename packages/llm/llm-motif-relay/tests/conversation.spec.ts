import { createAssistantMessage, createMessage, createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm/message'
import { describe, expect, it } from 'vitest'
import { conversationSummary, latestEditRequest } from '../src/conversation.ts'

const user = (text: string) => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
const assistant = (text: string) => createAssistantMessage({
  content: [{ type: 'text', text }],
  source: { provider: 'motif-relay', model: 'claude-code' },
})

const runtimeContext = (text: string) => createMessage({
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'agent-instructions' },
})

describe('latestEditRequest', () => {
  it('returns the last non-blank user text and skips system and assistant messages', () => {
    const messages = [
      createSystemMessage('You are a helpful agent.'),
      user('first request'),
      assistant('first answer'),
      user('second request'),
    ]

    expect(latestEditRequest(messages)).toBe('second request')
  })

  it('ignores runtime reminders injected beside the user text', () => {
    const messages = [
      user('Cut the intro.'),
      runtimeContext('<system-reminder>Current working directory: /brands/acme</system-reminder>'),
    ]

    expect(latestEditRequest(messages)).toBe('Cut the intro.')
    expect(conversationSummary(messages, { maxMessages: 4, maxChars: 100 }).text).toBe('')
  })

  it('returns undefined when the request carries no user text', () => {
    expect(latestEditRequest([createSystemMessage('prompt')])).toBeUndefined()
  })
})

describe('conversationSummary', () => {
  it('keeps the newest earlier messages and never includes the Edit Request', () => {
    const messages = [
      user('first request'),
      assistant('first answer'),
      user('second request'),
      assistant('second answer'),
      user('third request'),
    ]

    const summary = conversationSummary(messages, { maxMessages: 2, maxChars: 10_000 })

    expect(summary.text).toBe('User: second request\nAssistant: second answer')
    expect(summary.omittedMessages).toBe(2)
  })

  it('counts messages dropped by the character budget', () => {
    const messages = [
      user('a'.repeat(10)),
      assistant('b'.repeat(10)),
      user('c'.repeat(10)),
      user('edit request'),
    ]

    const summary = conversationSummary(messages, { maxMessages: 10, maxChars: 25 })

    expect(summary.text).toBe('User: cccccccccc')
    expect(summary.omittedMessages).toBe(2)
  })

  it('keeps the tail of one message longer than the character budget', () => {
    const messages = [assistant('0123456789'), user('edit request')]

    const summary = conversationSummary(messages, { maxMessages: 10, maxChars: 6 })

    expect(summary.text).toBe('…56789')
    expect(summary.omittedMessages).toBe(0)
  })

  it('reports an empty digest before the first Edit Request', () => {
    const summary = conversationSummary([user('edit request')], { maxMessages: 4, maxChars: 100 })

    expect(summary).toEqual({ text: '', omittedMessages: 0 })
  })
})
