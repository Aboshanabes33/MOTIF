import styles from './MotifSection.module.css'
import { useState, useSyncExternalStore } from 'react'
export interface DeveloperModePreference {
  enabled: { getSnapshot(): boolean; subscribe(listener: () => void): () => void }
  setEnabled(enabled: boolean): Promise<void>
}
/** Uses the existing Host-backed preference that already gates real Harness tools. */
export function useDeveloperMode(preference?: DeveloperModePreference): boolean {
  return useSyncExternalStore(
    preference?.enabled.subscribe ?? (() => () => {}),
    preference?.enabled.getSnapshot ?? (() => false),
    () => false,
  )
}
export function DeveloperModeSection({ preference }: { preference?: DeveloperModePreference }) {
  const enabled = useDeveloperMode(preference)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  return <section className={styles.root} aria-label="MOTIF mode" style={{ padding:24,minWidth:0,width:'100%',boxSizing:'border-box' }}>
    <h2>Developer Mode</h2>
    <p>Use the full Harness interface and developer tools. Brands, sessions and connections stay in the same app.</p>
    <button className={styles.primary} style={{ minHeight:44,alignSelf:'flex-start' }} type="button" role="switch" aria-checked={enabled} disabled={!preference || busy}
      onClick={() => {
        if (!preference) return
        setBusy(true); setError(undefined)
        void preference.setEnabled(!enabled).catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : 'Mode was not saved')
        }).finally(() => { setBusy(false) })
      }}>{busy ? 'Saving mode...' : enabled ? 'Return to MOTIF Mode' : 'Switch to Developer Mode'}</button>
    {error && <p role="alert">{error}</p>}
  </section>
}
