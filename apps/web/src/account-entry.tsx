import { createRoot } from 'react-dom/client'
import { ConvexReactClient } from 'convex/react'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { Account, sessionApi } from './account.tsx'
import './account.css'
const root = document.getElementById('root')
if (!root) throw new Error('Missing account root')
const config = (import.meta as ImportMeta & { env: { VITE_CONVEX_URL?: string } }).env.VITE_CONVEX_URL
let client: ConvexReactClient | undefined
try { if (config && new URL(config).protocol === 'https:') client = new ConvexReactClient(config) } catch { /* Fail closed on invalid deployment config. */ }
createRoot(root).render(<main><header><span>MOTIF</span><h1>Your creative account</h1><p>Sign in to your private account Brands.</p></header>{client ? <ConvexAuthProvider client={client} api={sessionApi} ambientSignIns={[]}><Account/></ConvexAuthProvider> : <section role="status"><h2>Account service not configured</h2><p>This build needs a valid HTTPS VITE_CONVEX_URL and configured email delivery. No credentials have been requested or sent.</p><p>The local Host remains a separate single-user app. Do not expose it as a shared account runtime.</p></section>}</main>)
