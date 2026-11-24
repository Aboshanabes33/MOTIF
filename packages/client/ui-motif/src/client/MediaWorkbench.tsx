import { MediaRenderControls } from './MediaRenderControls.tsx'
import { useEffect, useRef, useState } from 'react'
import styles from './MotifSection.module.css'
export interface ReviewedMediaPlan { version: 1; source: string; clips: { start: number; end: number; title?: string }[] }
/** Pure review validation mirrors the Host's restricted media-plan contract. */
export function reviewMediaPlan(source: string, duration: number, clips: ReviewedMediaPlan['clips']): ReviewedMediaPlan {
  if (!/^assets\/[^/\\\x00-\x1f]+\.(mp4|mov|webm|mkv|m4v)$/i.test(source)) throw new Error('Select a supported local video first.')
  if (!Number.isFinite(duration) || duration <= 0 || duration > 7200) throw new Error('Source must be no longer than two hours.')
  if (clips.length < 1 || clips.length > 20) throw new Error('Choose 1 to 20 clips.')
  let total = 0
  for (const clip of clips) {
    if (!Number.isFinite(clip.start) || !Number.isFinite(clip.end) || clip.start < 0 || clip.end <= clip.start || clip.end > duration) throw new Error('Every clip must stay inside the source duration.')
    if (clip.title !== undefined && clip.title.length > 160) throw new Error('Titles must be at most 160 characters.')
    total += clip.end - clip.start
  }
  if (total > 600) throw new Error('Reviewed output is limited to ten minutes.')
  return { version: 1, source, clips: clips.map(clip => ({ ...clip })) }
}
/** Local-only review surface. Does not upload footage or execute a renderer. */
export function MediaWorkbench({ brand }: { brand?: string }) {
  const [file, setFile] = useState<File>()
  const [url, setUrl] = useState<string>()
  const [source, setSource] = useState('')
  const [duration, setDuration] = useState(0)
  const [clips, setClips] = useState<ReviewedMediaPlan['clips']>([])
  const [reviewed, setReviewed] = useState<ReviewedMediaPlan>()
  const [error, setError] = useState('')
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  function update(index: number, patch: Partial<ReviewedMediaPlan['clips'][number]>) {
    setReviewed(undefined); setClips(previous => previous.map((clip, i) => i === index ? { ...clip, ...patch } : clip))
  }
  function download() {
    if (!reviewed) return
    const link = document.createElement('a')
    const object = URL.createObjectURL(new Blob([JSON.stringify(reviewed, null, 2)], { type: 'application/json' }))
    link.href = object; link.download = 'motif-reviewed-edit-plan.json'; link.click()
    setTimeout(() => { URL.revokeObjectURL(object) }, 1000)
  }
  return <section className={styles.timeline} aria-label="Video edit plan">
    <h3>Video edit plan</h3>
    <p>Preview a local video, choose cuts and titles, then review the exact plan.
      Choosing a file and reviewing cuts stays local. Upload only starts from the separate renderer control.</p>
    <label>Choose local video<input type="file" accept=".mp4,.mov,.webm,.mkv,.m4v" onChange={(event) => {
      const file = event.target.files?.[0]; setFile(undefined); setReviewed(undefined); setError(''); setDuration(0); setClips([]); setSource(''); setUrl(undefined)
      if (!file) return
      if (file.size > 1024 * 1024 * 1024 || !/\.(mp4|mov|webm|mkv|m4v)$/i.test(file.name) || /[/\\\x00-\x1f]/.test(file.name)) { setError('Choose a supported video no larger than 1 GiB.'); return }
      setFile(file); setSource(`assets/${file.name}`); setUrl(URL.createObjectURL(file))
    }}/></label>
    {url && <><video ref={video} src={url} controls preload="metadata" style={{ width: '100%', maxHeight: 320 }} onLoadedMetadata={(event) => {
      const seconds = event.currentTarget.duration
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 7200) { setError('Source duration is unsupported.'); return }
      setDuration(seconds); setClips([{ start: 0, end: Math.min(seconds, 30) }])
    }} onError={() => { setDuration(0); setReviewed(undefined); setError('This browser cannot preview the selected video. Choose another supported file.') }}/><p>Source: {source}. Duration: {duration.toFixed(2)} seconds.</p></>}
    {clips.map((clip, index) => <fieldset key={index} style={{ margin: '12px 0', display: 'grid', gap: 8 }}><legend>Clip {index + 1}</legend>
      <label>Start seconds<input type="number" min="0" max={duration} step="0.01" value={clip.start} onChange={(event) => { update(index, { start: event.target.valueAsNumber }) }}/></label>
      <label>End seconds<input type="number" min="0" max={duration} step="0.01" value={clip.end} onChange={(event) => { update(index, { end: event.target.valueAsNumber }) }}/></label>
      <label>Title<input maxLength={160} value={clip.title ?? ''} onChange={(event) => { update(index, { title: event.target.value }) }}/></label>
      <button type="button" className={styles.secondary} onClick={() => { if (video.current && Number.isFinite(clip.start)) video.current.currentTime = Math.max(0, Math.min(duration, clip.start)) }}>Preview clip start</button>
      <button type="button" className={styles.ghost} onClick={() => { setReviewed(undefined); setClips(previous => previous.filter((_, i) => i !== index)) }}>Remove clip {index + 1}</button>
    </fieldset>)}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button type="button" className={styles.secondary} disabled={!duration || clips.length >= 20} onClick={() => { setReviewed(undefined); setClips(previous => [...previous, { start: 0, end: Math.min(duration, 30) }]) }}>Add clip</button>
      <button type="button" className={styles.primary} disabled={!duration} onClick={() => { try { setReviewed(reviewMediaPlan(source, duration, clips)); setError('') } catch (reason) { setReviewed(undefined); setError(reason instanceof Error ? reason.message : 'Invalid edit plan') } }}>Review plan</button>
      <button type="button" className={styles.secondary} disabled={!reviewed} onClick={download}>Download reviewed plan JSON</button></div>
    {reviewed && <><p role="status">Reviewed {reviewed.clips.length} clips, {reviewed.clips.reduce((sum, clip) => sum + clip.end - clip.start, 0).toFixed(2)} output seconds. Any edit requires another review.</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(reviewed, null, 2)}</pre></>}
    {brand && <MediaRenderControls key={brand} brand={brand} file={file} plan={reviewed} />}
    {error && <p role="alert">{error}</p>}
    <p>Rendering and MP4 export are unavailable. No file is uploaded or copied to the Brand by this picker.
      The separate renderer remains gated until Session review and full browser/desktop acceptance are verified.</p>
  </section>
}
