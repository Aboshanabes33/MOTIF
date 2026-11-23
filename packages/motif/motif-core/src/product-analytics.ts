/** Privacy-first event boundary. Production SDK wiring is deliberately separate. */
export const PRODUCT_EVENTS = {
  onboarding_completed: ['method'], mode_changed: ['mode'], brand_created: ['method'],
  workspace_opened: [], edit_requested: [], provider_selected: ['provider'],
  job_started: [], job_completed: ['durationBucket'], job_failed: ['code'],
} as const
export type ProductEventName = keyof typeof PRODUCT_EVENTS
export interface AnalyticsSink {
  capture(input:{ distinctId:string;event:string;properties:Record<string,string> }):void
  identify(input:{ distinctId:string }):void
  shutdown?():Promise<void>
}
export interface AnalyticsPolicy { environment:'development'|'production'; consent:boolean; configured:boolean }
const allowed:Record<string,readonly string[]>={
  method:['manual','website','video','skip','setup'],mode:['motif','developer'],provider:['claude-code','codex'],
  durationBucket:['under10s','under1m','under10m','longer'],code:['cancelled','timeout','unavailable','invalid','failed'],
}
/** Allowlist values, not a denylist that can miss a prompt or a secret under a new key. */
export function productProperties(event:ProductEventName,input:Record<string,unknown>):Record<string,string>{
  const output:Record<string,string>={}
  for(const key of PRODUCT_EVENTS[event]){
    const value=input[key]
    if(typeof value==='string'&&allowed[key]?.includes(value))output[key]=value
  }
  return output
}
export class MotifAnalytics {
  private identity:string|undefined
  constructor(private readonly sink:AnalyticsSink|undefined,private policy:AnalyticsPolicy){}
  setPolicy(policy:AnalyticsPolicy):void{this.policy=policy;if(!this.enabled)this.identity=undefined}
  get enabled():boolean{return !!this.sink&&this.policy.configured&&this.policy.consent&&this.policy.environment==='production'}
  /** Only a backend-verified opaque account ID may enter this method; never email/name/token. */
  signIn(verifiedAccountId:string):void{
    this.identity=undefined
    if(!this.enabled||!/^account_[a-zA-Z0-9_-]{8,80}$/.test(verifiedAccountId))return
    try{this.sink?.identify({ distinctId:verifiedAccountId });this.identity=verifiedAccountId}catch{this.identity=undefined}
  }
  /** No queued pre-auth events and no identity survives sign-out. */
  signOut():void{this.identity=undefined}
  track(event:ProductEventName,properties:Record<string,unknown>={}):void{
    if(!this.enabled||!this.identity||!Object.hasOwn(PRODUCT_EVENTS,event))return
    try{this.sink?.capture({ distinctId:this.identity,event:`motif_${event}`,properties:productProperties(event,properties) })}catch{ /* Analytics never blocks an action. */ }
  }
}
