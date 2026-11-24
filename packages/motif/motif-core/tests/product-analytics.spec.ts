import { describe,expect,it,vi } from 'vitest'
import { MotifAnalytics,productProperties } from '../src/product-analytics.ts'
const policy={ environment:'production' as const,consent:true,configured:true }
function setup(){const sink={ capture:vi.fn(),identify:vi.fn() };return { sink,analytics:new MotifAnalytics(sink,policy) }}
describe('analytics privacy boundary',()=>{
  it('only sends allowlisted enums, never arbitrary properties or values',()=>{
    expect(productProperties('brand_created',{ method:'website',name:'private',prompt:'secret',apiKey:'secret' })).toEqual({ method:'website' })
    expect(productProperties('brand_created',{ method:'private transcript' })).toEqual({})
  })
  it('does not initialize a missing sink or send without configuration',()=>{
    expect(()=>new MotifAnalytics(undefined,policy).track('job_started')).not.toThrow()
    const { sink,analytics }=setup();analytics.setPolicy({ ...policy,configured:false });analytics.signIn('account_12345678');analytics.track('job_started');expect(sink.capture).not.toHaveBeenCalled()
  })
  it('requires consent and does not retain events for later opt-in',()=>{
    const { sink,analytics }=setup();analytics.setPolicy({ ...policy,consent:false });analytics.signIn('account_12345678');analytics.track('job_started')
    analytics.setPolicy(policy);analytics.track('job_started');expect(sink.capture).not.toHaveBeenCalled()
  })
  it('identifies only an opaque verified account and clears it on sign-out',()=>{
    const { sink,analytics }=setup();analytics.signIn('account_12345678');analytics.track('job_completed',{ durationBucket:'under1m' })
    expect(sink.capture).toHaveBeenCalledWith({ distinctId:'account_12345678',event:'motif_job_completed',properties:{ durationBucket:'under1m' } })
    analytics.signOut();analytics.track('job_started');expect(sink.capture).toHaveBeenCalledTimes(1)
  })
  it('rejects email identities and development events',()=>{
    const { sink,analytics }=setup();analytics.signIn('person@example.com');analytics.track('edit_requested');expect(sink.identify).not.toHaveBeenCalled()
    analytics.setPolicy({ ...policy,environment:'development' });analytics.signIn('account_12345678');expect(sink.identify).not.toHaveBeenCalled()
  })
})

it('revokes on account switch instead of flushing the previous identity queue',()=>{
  const { sink,analytics }=setup()
  analytics.signIn('account_12345678')
  analytics.track('job_started')
  analytics.signIn('account_87654321')
  analytics.track('job_started')
  expect(analytics.authenticated).toBe(false)
  expect(sink.capture).toHaveBeenCalledTimes(1)
})
