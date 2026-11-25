import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { MotifBridge } from './contract.js';
import './style.css';
declare global { interface Window { motif: MotifBridge } }
function Spike() {
  const [status, setStatus] = useState('Not checked');
  const [busy, setBusy] = useState(false);
  async function run(kind: 'status' | 'pair') {
    setBusy(true);
    try { const reply = await window.motif.request({kind}); setStatus(reply.kind === 'status' ? `${reply.name} · ${reply.pairedClients} paired clients` : reply.saved ? 'Private configuration saved. Pairing expires in 15 minutes.' : 'Pairing cancelled.'); }
    catch { setStatus('Request failed. No additional capability was granted.'); }
    finally { setBusy(false); }
  }
  return <main><p className="eyebrow">ARCHITECTURE SPIKE / 116</p><h1>MOTIF</h1><p className="intro">A small, independent desktop boundary.</p><section><h2>Local connection</h2><p>One read-only capability. No shell, media access, or remote services.</p><div><button disabled={busy} onClick={() => run('status')}>Check service</button><button className="secondary" disabled={busy} onClick={() => run('pair')}>Pair local MCP client</button></div><output aria-live="polite">{status}</output></section><footer>Phase 0 only. Product features and supported operating systems are not approved or verified by this spike.</footer></main>;
}
createRoot(document.getElementById('root')!).render(<Spike/>);
