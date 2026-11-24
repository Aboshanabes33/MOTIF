import { it, expect } from 'vitest'
import { cutCaptions, captionsVtt } from '../src/media-captions.ts'
import { compositionHtml } from '../src/media-pipeline.ts'
it('retimes words across reordered, repeated and clipped source intervals', () => {
  const transcript = { segments: [{ start: 0, end: 4, text: 'one two', words: [
    { start: 0, end: 1, word: 'one' }, { start: 2, end: 3, word: ' two' },
  ] }] }
  const cues = cutCaptions(transcript, [{ start: 2, end: 3 }, { start: 0, end: 1 }, { start: 2, end: 2.5 }])
  expect(cues).toEqual([{ start: 0, end: 1, text: 'two' }, { start: 1, end: 2, text: 'one' }, { start: 2, end: 2.5, text: 'two' }])
})
it('escapes transcript text in both generated HTML and WebVTT', () => {
  const cues = [{ start: 0, end: 1.25, text: '<script> &\nhello' }]
  expect(captionsVtt(cues)).toContain('00:00:00.000 --> 00:00:01.250')
  expect(captionsVtt(cues)).toContain('&lt;script&gt; &amp; hello')
  const html = compositionHtml([{ start: 0, end: 2 }], cues)
  expect(html).not.toContain('<script>'); expect(html).toContain('class="clip caption"')
})
