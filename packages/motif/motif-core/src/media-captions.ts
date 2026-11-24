/** Transcript timestamps are data. Retiming follows the reviewed cut order, including repeated source ranges. */
import type { EditPlan, Transcript } from './media-pipeline.ts'
export interface CaptionCue { start: number; end: number; text: string }
export function cutCaptions(transcript: Transcript, clips: EditPlan['clips']): CaptionCue[] {
  const cues: CaptionCue[] = []; let offset = 0
  for (const clip of clips) {
    for (const segment of transcript.segments) {
      const start = Math.max(clip.start, segment.start), end = Math.min(clip.end, segment.end)
      if (end <= start) continue
      const words = segment.words?.filter(word => word.end > start && word.start < end)
      const text = words ? words.map(word => word.word).join('').trim() : segment.text.trim()
      if (text) cues.push({
        start: offset + Math.max(start, words?.[0]?.start ?? start) - clip.start,
        end: offset + Math.min(end, words?.at(-1)?.end ?? end) - clip.start,
        text,
      })
      if (cues.length > 10000) throw new Error('Caption cue budget exceeded')
    }
    offset += clip.end - clip.start
  }
  return cues
}
export function captionsVtt(cues: CaptionCue[]): string {
  const time = (value: number): string => {
    const ms = Math.round(value * 1000)
    return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
  }
  return 'WEBVTT\n\n' + cues.map(cue => `${time(cue.start)} --> ${time(cue.end)}\n${cue.text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/[\r\n]+/g, ' ')}\n`).join('\n')
}
