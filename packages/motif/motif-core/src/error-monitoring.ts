/** Safe diagnostic ownership: no raw error text, content or local paths leave this boundary. */
export type ErrorOperation='startup'|'brand-read'|'brand-create'|'connection-probe'|'relay-send'|'media-render'
export type ErrorCode='failed'|'timeout'|'cancelled'|'unavailable'|'invalid'
export interface SafeErrorEvent {
  message:'MOTIF operation failed'
  level:'error'
  tags:{ operation:ErrorOperation;code:ErrorCode;runtime:'host'|'renderer';environment:'production'|'development' }
  release?:string
}
export interface MonitoringSink { captureEvent(event:SafeErrorEvent):unknown }
const OPERATIONS=new Set(['startup','brand-read','brand-create','connection-probe','relay-send','media-render'])
const CODES=new Set(['failed','timeout','cancelled','unavailable','invalid'])
/** Rebuild from a closed schema. Do not try to scrub arbitrary unknown event fields. */
export function safeErrorEvent(input:unknown):SafeErrorEvent|null{
  if(!input||typeof input!=='object')return null
  const row=input as Record<string,unknown>, tags=row.tags as Record<string,unknown>|undefined
  if(!tags||!OPERATIONS.has(String(tags.operation))||!CODES.has(String(tags.code)))return null
  if(!['host','renderer'].includes(String(tags.runtime))||!['production','development'].includes(String(tags.environment)))return null
  const release=typeof row.release==='string'&&/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(row.release)?row.release:undefined
  return { message:'MOTIF operation failed',level:'error',tags:{ operation:tags.operation as ErrorOperation,code:tags.code as ErrorCode,runtime:tags.runtime as 'host'|'renderer',environment:tags.environment as 'production'|'development' },...release?{ release }:{} }
}
export class MotifErrorMonitoring {
  private readonly seen=new WeakSet<object>()
  constructor(private readonly sink:MonitoringSink|undefined,private readonly config:{ dsn?:string;enabled:boolean;release?:string;runtime:'host'|'renderer';environment:'production'|'development' }){}
  get enabled():boolean{return !!this.sink&&!!this.config.dsn&&this.config.enabled&&this.config.environment==='production'}
  /** Owner captures once. Forwarded errors must retain the same object locally or pass an explicit ownership flag. */
  capture(error:unknown,operation:ErrorOperation,code:ErrorCode='failed',owner=true):void{
    if(!this.enabled||!owner||code==='cancelled')return
    if(typeof error==='object'&&error!==null){if(this.seen.has(error))return;this.seen.add(error)}
    const event=safeErrorEvent({
      tags: { operation, code, runtime: this.config.runtime, environment: this.config.environment },
      release: this.config.release,
    })
    if(!event)return
    try{this.sink?.captureEvent(event)}catch{ /* Monitoring must never interrupt the app. */ }
  }
}
