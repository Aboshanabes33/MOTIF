/** Standalone account client. Deliberately never imports the local Host bootstrap. */
import { useState, type FormEvent } from 'react'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { useAuthActions } from '@convex-dev/auth/react'
import { useSignInWithEmailPassword, useSignUpWithEmailPassword, useStartPasswordRecovery, useCompleteSignUpWithEmailPassword, useCompletePasswordRecovery } from '@convex-dev/auth/methods/email-password/react'

type ApiOf<T extends (...args: never[]) => unknown> = Parameters<T>[0]
// These names match convex/auth.ts. Generated deployment files are not required for a frontend build.
const signInApi: ApiOf<typeof useSignInWithEmailPassword> = { signInWithEmailPassword: makeFunctionReference('auth:signInWithEmailPassword') }
const signUpApi: ApiOf<typeof useSignUpWithEmailPassword> = { signUpWithEmailPassword: makeFunctionReference('auth:signUpWithEmailPassword') }
const validateApi: ApiOf<typeof useCompleteSignUpWithEmailPassword> = { completeSignUpWithEmailPassword: makeFunctionReference('auth:completeSignUpWithEmailPassword') }
const recoveryApi: ApiOf<typeof useStartPasswordRecovery> = { startPasswordRecovery: makeFunctionReference('auth:startPasswordRecovery') }
const resetApi: ApiOf<typeof useCompletePasswordRecovery> = { checkPasswordRecovery: makeFunctionReference('auth:checkPasswordRecovery'), completePasswordRecovery: makeFunctionReference('auth:completePasswordRecovery') }
export const sessionApi: Parameters<typeof import('@convex-dev/auth/react').ConvexAuthProvider>[0]['api'] = { refreshSession: makeFunctionReference('auth:refreshSession'), signOut: makeFunctionReference('auth:signOut'), isAuthenticated: makeFunctionReference('auth:isAuthenticated') }
const listBrands = makeFunctionReference<'query', Record<string, never>, { _id: string; name: string }[] | null>('brands:listMine')
const createBrand = makeFunctionReference<'mutation', { name: string }, string>('brands:createBrand')

function Validation({ code }: { code: string }) {
  const state = useCompleteSignUpWithEmailPassword(validateApi, { emailCode: code })
  return <p role="status">{state.status === 'complete' ? 'Email verified. Your account is ready.' : state.status === 'loading' ? 'Verifying your email...' : 'This link cannot be used. Open it in the browser that requested it, or sign up again.'}</p>
}
function Reset({ code }: { code: string }) {
  const state = useCompletePasswordRecovery(resetApi, { emailCode: code })
  const [error, setError] = useState('')
  if (state.status !== 'ready') return <p role="status">{state.status === 'loading' ? 'Checking recovery link...' : state.status === 'complete' ? 'Password changed. You are signed in.' : 'This recovery link cannot be used. Request a new one in this browser.'}</p>
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError('')
    const form = e.currentTarget
    try {
      const result = await state.completePasswordRecovery({ newPassword: String(new FormData(form).get('password')) })
      if (result.status === 'error') setError('Password could not be changed. Check password requirements and try again.')
    } catch { setError('Cannot reach account service. Check your connection and try again.') }
    finally { const input = form.elements.namedItem('password'); if (input instanceof HTMLInputElement) input.value = '' }
  }
  return <form onSubmit={(e) => { void submit(e) }}><label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} required disabled={state.pending}/></label><button disabled={state.pending}>Reset password and sign in</button><p role="alert">{error}</p></form>
}
function Brands() {
  const brands = useQuery(listBrands, {})
  const create = useMutation(createBrand)
  const { signOut } = useAuthActions()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  return <><h2>Your account Brands</h2><p>These records belong to your verified account. They are separate from local Host Brand folders.</p>{brands === undefined ? <p>Loading Brands...</p> : brands === null ? <p>Session unavailable. Sign in again.</p> : <ul>{brands.map(brand => <li key={brand._id}>{brand.name}</li>)}</ul>}<form onSubmit={(e) => { e.preventDefault(); const form = e.currentTarget; const name = String(new FormData(form).get('name')).trim(); if (!name) { setError('Brand name is required.'); return }; setError(''); setPending(true); void create({ name }).then(() => { form.reset() }).catch(() => { setError('Could not save Brand. Your session may have expired.') }).finally(() => { setPending(false) }) }}><label>Brand name<input name="name" required maxLength={120} disabled={pending}/></label><button disabled={pending || brands == null}>Create Brand</button></form><p className="notice">AI sessions, local files and native execution are unavailable for account users until an isolated account runtime gateway is configured. Signing in does not unlock a shared Host.</p><button onClick={() => { void signOut().catch(() => { setError('Sign out could not finish. Check your connection and retry.') }) }}>Sign out</button><p role="alert">{error}</p></>
}
export function Account() {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const [mode, setMode] = useState<'signin' | 'signup' | 'recover'>('signin')
  const [message, setMessage] = useState('')
  const signIn = useSignInWithEmailPassword(signInApi)
  const signUp = useSignUpWithEmailPassword(signUpApi)
  const recover = useStartPasswordRecovery(recoveryApi)
  const busy = signIn.pending || signUp.pending || recover.pending
  const flow = new URLSearchParams(location.search)
  if (isLoading) return <p role="status">Restoring your session...</p>
  if (isAuthenticated) return <Brands/>
  if (flow.get('flow') === 'validate') return <Validation code={flow.get('code') ?? ''}/>
  if (flow.get('flow') === 'reset') return <Reset code={flow.get('code') ?? ''}/>
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setMessage('')
    const form = e.currentTarget
    const data = new FormData(form)
    const email = String(data.get('email'))
    const password = String(data.get('password') ?? '')
    try {
      if (mode === 'recover') { const result = await recover.startPasswordRecovery({ email }); setMessage(result.success ? 'If the account can receive recovery mail, check your inbox. Open the link in this browser.' : 'Recovery could not start. Try again later.') }
      else if (mode === 'signup') { const result = await signUp.signUp({ email, password }); setMessage(result.success ? 'Check your email to verify your account. Open the link in this browser.' : 'Account could not be created. Check password requirements or try signing in.') }
      else { const result = await signIn.signIn({ email, password }); if (result.status === 'error') setMessage('Sign in failed. Check your details and verify your email first.') }
    } catch { setMessage('Cannot reach account service. Check your connection and try again.') }
    finally { const input = form.elements.namedItem('password'); if (input instanceof HTMLInputElement) input.value = '' }
  }
  return <><nav aria-label="Account actions">{(['signin', 'signup', 'recover'] as const).map(value => <button key={value} aria-pressed={mode === value} disabled={busy} onClick={() => { setMode(value); setMessage('') }}>{value === 'signin' ? 'Sign in' : value === 'signup' ? 'Create account' : 'Forgot password'}</button>)}</nav><form key={mode} onSubmit={(e) => { void submit(e) }}><label>Email<input name="email" type="email" autoComplete="email" required disabled={busy}/></label>{mode !== 'recover' && <label>Password<input name="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 12 : 1} required disabled={busy}/></label>}<button disabled={busy}>{busy ? 'Please wait...' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send recovery link'}</button></form><p role="status">{message}</p></>
}
