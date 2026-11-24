// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MediaWorkbench, reviewMediaPlan } from '../src/client/MediaWorkbench.tsx'
afterEach(cleanup)
describe('reviewed local edit plans', () => {
  it('copies a bounded plan', () => { const clips = [{ start: 1, end: 4, title: '<script>text only</script>' }]; const plan = reviewMediaPlan('assets/clip.mp4', 10, clips); clips[0]!.end = 7; expect(plan.clips[0]!.end).toBe(4) })
  it.each(['../file.mp4', 'https://example.com/file.mp4', '/file.mp4', 'assets/../file.mp4', 'assets/file.txt'])('rejects unsafe source %s', (source) => { expect(() => reviewMediaPlan(source, 10, [{ start: 0, end: 1 }])).toThrow() })
  it.each([[0, 0], [-1, 4], [1, 11], [NaN, 4], [Infinity, 5]])('rejects invalid cut %s,%s', (start, end) => { expect(() => reviewMediaPlan('assets/clip.mp4', 10, [{ start, end }])).toThrow() })
  it('enforces total output and clip limits', () => { expect(() => reviewMediaPlan('assets/clip.mp4', 1000, [{ start: 0, end: 601 }])).toThrow(); expect(() => reviewMediaPlan('assets/clip.mp4', 10, Array.from({ length: 21 }, () => ({ start: 0, end: 1 })))).toThrow() })
  it('never pretends a JSON download is a video render', () => { render(<MediaWorkbench/>); expect(screen.getByText(/Rendering and MP4 export are unavailable/)).toBeTruthy(); expect((screen.getByRole('button', { name: 'Download reviewed plan JSON' }) as HTMLButtonElement).disabled).toBe(true); expect(screen.getByLabelText('Choose local video')).toBeTruthy() })
})
