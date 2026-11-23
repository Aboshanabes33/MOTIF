/** Local media job boundary. Plans are data, never shell programs. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
const exec = promisify(execFile)
export interface EditPlan { version: 1; source: string; clips: { start: number; end: number; title?: string }[] }
export interface MediaTools { ffmpeg: string; ffprobe: string; whisper: string; hyperframes: string }
export type MediaStage = 'probe' | 'transcribe' | 'cut' | 'compose' | 'render' | 'verify' | 'completed' | 'failed' | 'cancelled'
export interface ProcessRequest { file: string; args: string[]; cwd: string; signal: AbortSignal; timeout: number; env?: NodeJS.ProcessEnv }
export type ProcessRunner = (request: ProcessRequest) => Promise<{ stdout: string; stderr: string }>
export const runMediaProcess: ProcessRunner = async request => await exec(request.file, request.args, {
  cwd: request.cwd, signal: request.signal, timeout: request.timeout, maxBuffer: 2*1024*1024,
  windowsHide: true, env: request.env,
})
/** Reject arbitrary operations and enforce resource budgets before any process starts. */
export function validateEditPlan(value: EditPlan): void {
  if (!value || value.version !== 1 || typeof value.source !== 'string' || !value.source || isAbsolute(value.source)) throw new Error('Source must be a workspace-relative file')
  if (!Array.isArray(value.clips) || value.clips.length < 1 || value.clips.length > 20) throw new Error('Choose 1 to 20 clips')
  let duration=0
  for(const clip of value.clips) {
    if (!Number.isFinite(clip.start) || !Number.isFinite(clip.end) || clip.start < 0 || clip.end <= clip.start) throw new Error('Invalid clip range')
    duration+=clip.end-clip.start
    if (clip.title !== undefined && (typeof clip.title !== 'string' || clip.title.length>160)) throw new Error('Title is too long')
  }
  if(duration>600) throw new Error('Output is limited to 10 minutes')
}
/** Resolve symlinks before checking containment; never pass remote URLs to FFmpeg. */
export async function mediaSource(root: string, input: string): Promise<string> {
  const base=await realpath(root), file=await realpath(resolve(base,input)), rel=relative(base,file)
  if (!rel || rel==='..' || rel.startsWith(`..${process.platform==='win32'?'\\':'/'}`) || isAbsolute(rel)) throw new Error('Source must stay inside its Brand workspace')
  if (!['.mp4','.mov','.webm','.mkv','.m4v'].includes(extname(file).toLowerCase())) throw new Error('Unsupported video format')
  const info=await stat(file)
  if(!info.isFile() || info.size>1024*1024*1024) throw new Error('Source must be a video no larger than 1 GiB')
  return file
}
const html = (text: string) => text.replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] ?? c))
/** Build only controlled finite HTML; instructions cannot introduce scripts or remote media. */
export function compositionHtml(clips: EditPlan['clips']): string {
  let at=0
  const body=clips.map((clip,index)=>{
    const duration=clip.end-clip.start,start=at;at+=duration
    return `<video id="clip-${index}" src="./clip-${index}.mp4" data-start="${start}" data-duration="${duration}" data-has-audio="true" playsinline></video>${clip.title?`<div id="title-${index}" class="clip title" data-start="${start}" data-duration="${duration}">${html(clip.title)}</div>`:''}`
  }).join('')
  return `<!doctype html><html><head><style>html,body{margin:0;background:#141416}#motif{width:1280px;height:720px;position:relative;overflow:hidden}video{position:absolute;width:100%;height:100%;object-fit:contain}.title{position:absolute;bottom:8%;left:6%;right:6%;font:48px sans-serif;color:white;background:#000b;padding:16px;overflow-wrap:anywhere}</style></head><body><div id="motif" data-composition-id="motif" data-width="1280" data-height="720" data-start="0" data-duration="${at}" data-no-timeline>${body}</div></body></html>`
}
export interface TranscriptSegment {
  start: number
  end: number
  text: string
  words?: { start: number; end: number; word: string }[]
}
export interface Transcript { language?: string; segments: TranscriptSegment[] }
export function validateTranscript(value: unknown): Transcript {
  const row=value as Transcript
  if(!row || !Array.isArray(row.segments) || row.segments.length>100000) throw new Error('Whisper returned an invalid transcript')
  for(const segment of row.segments) if(!Number.isFinite(segment.start)||!Number.isFinite(segment.end)||segment.start<0||segment.end<segment.start||typeof segment.text!=='string') throw new Error('Whisper returned invalid timestamps')
  return row
}
/** Run a structured plan with exact output verification. No model or provider selection occurs here. */
export async function renderEdit(root: string, plan: EditPlan, options: {
  tools: MediaTools
  signal: AbortSignal
  onStage?(stage: MediaStage): void
  run?: ProcessRunner
}): Promise<{ jobId: string; output: string; transcript: Transcript }> {
  validateEditPlan(plan)
  const source=await mediaSource(root,plan.source)
  const jobId=randomUUID(), directory=join(root,'timeline',`media-${jobId}`)
  await mkdir(directory,{ recursive:true })
  const run=options.run??runMediaProcess
  const stage=async(value:MediaStage)=>{
    options.onStage?.(value)
    await writeFile(join(directory,'status.json'),JSON.stringify({ jobId,stage:value,at:new Date().toISOString() }))
  }
  const invoke=(file:string,args:string[],timeout=120000)=>{
    options.signal.throwIfAborted()
    return run({ file,args,cwd:directory,signal:options.signal,timeout,env:{ ...process.env,HYPERFRAMES_NO_TELEMETRY:'1',DO_NOT_TRACK:'1' } })
  }
  try {
    await writeFile(join(directory,'plan.json'),JSON.stringify(plan,null,2))
    await stage('probe')
    const probe=JSON.parse((await invoke(options.tools.ffprobe,['-v','error','-show_entries','format=duration:stream=width,height,codec_type','-of','json',source])).stdout)
    const duration=Number(probe.format?.duration)
    if(!Number.isFinite(duration)||duration<=0||duration>7200||probe.streams?.some((s:{ width?:number;height?:number })=>(s.width??0)>3840||(s.height??0)>2160)||!probe.streams?.some((s:{ codec_type:string })=>s.codec_type==='video')) throw new Error('Source duration/streams are unsupported')
    if(plan.clips.some(clip=>clip.end>duration)) throw new Error('Clip extends beyond the source duration')
    await stage('transcribe')
    await invoke(options.tools.ffmpeg,['-nostdin','-y','-i',source,'-vn','-ac','1','-ar','16000','-t','7200','audio.wav'])
    // OpenAI Whisper local CLI, not a cloud endpoint. Language is auto-detected.
    let last:unknown
    for(let attempt=0;attempt<2;attempt++) {
      try { await invoke(options.tools.whisper,['audio.wav','--model','base','--output_format','json','--word_timestamps','True','--output_dir',directory],900000);last=undefined;break }
      catch(error) { last=error;if(options.signal.aborted)throw error }
    }
    if(last)throw last
    const transcriptFile=join(directory,'audio.json')
    if((await stat(transcriptFile)).size>8*1024*1024)throw new Error('Transcript is too large')
    const transcript=validateTranscript(JSON.parse(await readFile(transcriptFile,'utf8')))
    await stage('cut')
    for(const [index,clip] of plan.clips.entries()) {
      await invoke(options.tools.ffmpeg,['-nostdin','-y','-ss',String(clip.start),'-i',source,'-t',String(clip.end-clip.start),'-map','0:v:0','-map','0:a?','-c:v','libx264','-c:a','aac','-threads','2',`clip-${index}.mp4`])
    }
    await stage('compose')
    await writeFile(join(directory,'index.html'),compositionHtml(plan.clips))
    await stage('render')
    const output=join(directory,'output.mp4')
    await invoke(options.tools.hyperframes,['render',directory,'--output',output,'--workers','1','--fps','30','--no-best-effort','--refuse-outside-files'],900000)
    await stage('verify')
    if((await stat(output)).size===0)throw new Error('Render produced an empty file')
    const result=JSON.parse((await invoke(options.tools.ffprobe,['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',output])).stdout)
    const expected=plan.clips.reduce((sum,clip)=>sum+clip.end-clip.start,0)
    if(!Number.isFinite(Number(result.format?.duration))||!result.streams?.some((s:{ codec_type:string })=>s.codec_type==='video')||Math.abs(Number(result.format?.duration)-expected)>0.25)throw new Error('Rendered output failed verification')
    await stage('completed')
    return { jobId,output,transcript }
  } catch(error) {
    await stage(options.signal.aborted?'cancelled':'failed')
    throw error
  }
}
