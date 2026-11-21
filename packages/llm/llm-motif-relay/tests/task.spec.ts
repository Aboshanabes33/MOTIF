import { describe, expect, it } from 'vitest'
import { buildRelayTask } from '../src/task.ts'

describe('buildRelayTask', () => {
  it('pins the complete model-visible task text', () => {
    const task = buildRelayTask({
      editRequest: 'Cut the intro to four seconds.',
      brand: { text: 'Primary color: #1d4ed8\nFont: Inter Tight\n' },
      timelineFiles: [
        { path: 'timeline/main.json', text: '{"clips":[{"start":0,"end":4}]}' },
        { path: 'timeline/titles.md', text: 'Title card at 0:02' },
      ],
      conversation: {
        text: 'User: Make a cut for the spring campaign.\nAssistant: Rendered a 30-second cut.',
        omittedMessages: 2,
      },
    })

    expect(task).toBe([
      'Complete one video-edit request for a Brand. The current directory is the Brand folder.',
      '',
      '## Brand definition',
      'Primary color: #1d4ed8',
      'Font: Inter Tight',
      '',
      '## Timeline',
      '### timeline/main.json',
      '{"clips":[{"start":0,"end":4}]}',
      '',
      '### timeline/titles.md',
      'Title card at 0:02',
      '',
      '## Earlier conversation',
      'User: Make a cut for the spring campaign.',
      'Assistant: Rendered a 30-second cut.',
      '(2 earlier messages are out of budget.)',
      '',
      '## Edit Request',
      'Cut the intro to four seconds.',
      '',
      'Apply the Edit Request to the Source Video under this Brand, write the result into the Brand folder, and finish with a short answer describing what changed.',
      '',
    ].join('\n'))
  })

  it('names a fresh Brand instead of inventing content', () => {
    const task = buildRelayTask({
      editRequest: 'Add motion graphics.',
      brand: undefined,
      timelineFiles: [],
      conversation: { text: '', omittedMessages: 0 },
    })

    expect(task).toContain('(the Brand folder has no brand definition file)')
    expect(task).toContain('(the Brand folder has no timeline files)')
    expect(task).toContain('(this is the first message in this conversation)')
    expect(task).toContain('## Edit Request\nAdd motion graphics.')
  })

  it('preserves the supplied timeline order and single spacing between files', () => {
    const task = buildRelayTask({
      editRequest: 'Trim.',
      brand: { text: 'Brand' },
      timelineFiles: [
        { path: 'timeline/b.json', text: 'second\n\n' },
        { path: 'timeline/a.json', text: 'first' },
      ],
      conversation: { text: '', omittedMessages: 0 },
    })

    const timeline = task.slice(task.indexOf('## Timeline'), task.indexOf('## Earlier conversation'))
    expect(timeline).toBe('## Timeline\n### timeline/b.json\nsecond\n\n### timeline/a.json\nfirst\n\n')
  })

  it('depends only on its input', () => {
    const input = {
      editRequest: 'Repeatable.',
      brand: { text: 'Brand' },
      timelineFiles: [{ path: 'timeline/a.json', text: '{}' }],
      conversation: { text: 'User: earlier', omittedMessages: 0 },
    } as const

    expect(buildRelayTask(input)).toBe(buildRelayTask(input))
  })
})
