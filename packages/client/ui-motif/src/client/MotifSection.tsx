import { useDeveloperMode, type DeveloperModePreference } from './DeveloperMode.tsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import type { MotifActionResult, MotifApiKeySaveRequest, MotifApiKeySaveResult, MotifApiKeyStatus, MotifApiKeyTestRequest, MotifApiKeyTestResult, MotifApiProvider, MotifBrand, MotifBrandCreateRequest, MotifBrandIdentity, MotifConnection, MotifSnapshot, MotifTimelineEntry, MotifWebsiteSuggestion } from '@deepseek-ai/dsh-motif-core/types'
import type { MotifCopy } from './locales.ts'
import styles from './MotifSection.module.css'
import { MAX_LOGO_BYTES, validateLogoBytes } from './logo.ts'

/** Values every Motif settings surface receives through its slot `inject`. */
export interface MotifInjected {
  developerMode?: DeveloperModePreference

  /** Copy resolver bound to this package's locale namespace. */
  t: (key: MotifCopy, vars?: Readonly<Record<string, string | number>>) => string
  /** Read both backend cards and every Brand. */
  load: () => Promise<MotifSnapshot>
  /** Install one official tool. */
  install: (backend: 'claude-code' | 'codex') => Promise<{ ok: boolean; message: string }>
  /** Start one provider's own sign-in. */
  signIn: (backend: 'claude-code' | 'codex') => Promise<{ ok: boolean; message: string }>
  /** Send one short test request. */
  test: (backend: 'claude-code' | 'codex') => Promise<{ ok: boolean; message: string }>
  /** Persist a new Brand and register its workspace. */
  createBrand: (request: MotifBrandCreateRequest) => Promise<{ workspaceId: string }>
  /** Open a Brand's workspace. */
  openBrand: (workspaceId: string) => void
  /** Validate, store, and verify one provider API key. */
  saveApiKey: (request: MotifApiKeySaveRequest) => Promise<MotifApiKeySaveResult>
  /** Verify a draft key, or the stored key when the request carries none. */
  testApiKey: (request: MotifApiKeyTestRequest) => Promise<MotifApiKeyTestResult>
  /** Remove one provider's stored key. */
  deleteApiKey: (provider: MotifApiProvider) => Promise<MotifActionResult>
  /** UI-safe status of one provider's stored key. */
  apiKeyStatus: (provider: MotifApiProvider) => Promise<MotifApiKeyStatus>
  /** Read the default model and every model the relay routes offer. */
  loadModels: () => Promise<MotifModelCatalog>
  /** Save the default model new Sessions start with. */
  selectModel: (provider: string, model: string) => Promise<{ provider: string; model: string }>
  /** Read one Brand's real timeline files from its folder. */
  loadTimeline: (brand: MotifBrand) => Promise<readonly MotifTimelineEntry[]>
  /**
   * Submit one Edit Request to the Brand's real workspace Session (the MOTIF
   * session/relay flow). Aborting the signal cancels the in-flight turn.
   */
  sendEditRequest: (brand: MotifBrand, text: string, signal: AbortSignal) => Promise<{ ok: boolean; message: string }>
  /**
   * Analyze one public web page into a Brand identity suggestion. Aborting the
   * signal stops the wait; the bounded host fetch may finish in the background.
   */
  analyzeWebsite: (url: string, signal: AbortSignal) => Promise<MotifWebsiteSuggestion>
}

type Props = { [K in keyof MotifInjected]?: MotifInjected[K] | undefined }

/** One selectable model on a Motif relay route. */
export interface MotifModelOption {
  /** Provider route id (e.g. `motif-relay-claude`). */
  readonly provider: string
  /** Provider display label. */
  readonly providerLabel: string
  /** Model id the route offers. */
  readonly id: string
  /** Model display name. */
  readonly name: string
  /** Optional user-facing distinction. */
  readonly description?: string
}

/** The model picker's data: the current default and every relay-route option. */
export interface MotifModelCatalog {
  /** Selection new Sessions start with. */
  readonly current: { readonly provider: string; readonly model: string }
  /** Models offered by Motif's relay routes. */
  readonly options: readonly MotifModelOption[]
}

const FALLBACK_IDENTITY: MotifBrandIdentity = {
  primary: '#0F5C4B',
  accent: '#E8C57C',
  light: '#F7F4EC',
  dark: '#141414',
  latinFont: 'Space Grotesk',
  arabicFont: 'IBM Plex Sans Arabic',
  motion: 'soft',
  caption: 'word',
}

function useSnapshot(load: (() => Promise<MotifSnapshot>) | undefined) {
  const [snapshot, setSnapshot] = useState<MotifSnapshot | undefined>()
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = async (): Promise<void> => {
    if (load === undefined) {
      setError(true)
      setLoading(false)
      return
    }
    try {
      setSnapshot(await load())
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // The section is mounted once per settings visit; the host is polled by
    // explicit actions, so one read is enough to paint it.
  }, [])

  return { snapshot, error, loading, refresh }
}

function ProviderMark({ backend }: { backend: 'claude-code' | 'codex' }) {
  return backend === 'claude-code'
    ? <span className={styles.providerIcon}>C</span>
    : <span className={`${styles.providerIcon} ${styles.providerIconCodex}`}>G</span>
}

/**
 * AI-connection page: one card per backend, a three-step explanation, and the
 * provider's own sign-in. Replaces the former Models page.
 * @param props - slot inject face.
 * @returns the AI section.
 */
export function AiSection({
  t = key => key, load, install, signIn, test, saveApiKey, testApiKey, deleteApiKey, apiKeyStatus, loadModels, selectModel,
}: Props) {
  const { snapshot, error, loading, refresh } = useSnapshot(load)
  const [busy, setBusy] = useState<string | undefined>()
  const [messages, setMessages] = useState<Record<string, string>>({})

  const act = async (backend: 'claude-code' | 'codex', action: 'install' | 'signIn' | 'test'): Promise<void> => {
    const key = `${backend}:${action}`
    setBusy(key)
    setMessages(previous => ({ ...previous, [backend]: '' }))
    try {
      const runner = action === 'install' ? install : action === 'signIn' ? signIn : test
      if (runner === undefined) throw new Error('Motif connection service is unavailable')
      const result = await runner(backend)
      setMessages(previous => ({ ...previous, [backend]: result.message }))
      await refresh()
    } catch (reason: unknown) {
      setMessages(previous => ({ ...previous, [backend]: reason instanceof Error ? reason.message : String(reason) }))
    } finally {
      setBusy(undefined)
    }
  }

  const activity = snapshot?.activity ?? []
  const running = activity.find(entry => entry.state === 'running')
  const latest = activity[0]
  const labelOf = (backend: string): string =>
    snapshot?.connections.find(connection => connection.backend === backend)?.label ?? backend

  return (
    <div className={styles.root}>
      <div className={styles.aiLayout}>
        <div>
          <div className={styles.headerCopy}>
            <h1>{t('ai.title')}</h1>
            <p>{t('ai.intro')}</p>
          </div>
          <ol className={styles.steps}>
            {([
              ['ai.step1', 'ai.step1.body'],
              ['ai.step2', 'ai.step2.body'],
              ['ai.step3', 'ai.step3.body'],
            ] as const).map(([title, body], index) => (
              <li className={styles.step} key={title}>
                <span className={styles.stepNumber}>{index + 1}</span>
                <div><strong>{t(title)}</strong><span>{t(body)}</span></div>
              </li>
            ))}
          </ol>
          <div className={styles.warning}>{t('ai.experimental')}</div>
        </div>

        <div>
          {loading && <div className={styles.empty}>{t('ai.step1.body')}</div>}
          {error && <div className={styles.empty}>{t('ai.noneActive')}</div>}
          <div className={styles.cards}>
            {(snapshot?.connections ?? []).map((connection: MotifConnection) => {
              const cardBusy = busy?.startsWith(connection.backend) === true
              const cardActivity = activity.find(entry => entry.backend === connection.backend)
              const pill = connection.signedIn === 'yes'
                ? { label: t('ai.connected'), className: styles.pillConnected }
                : connection.signedIn === 'no'
                  ? { label: t('ai.notSignedIn'), className: styles.pillBad }
                  : connection.installed
                    ? { label: t('ai.unknown'), className: styles.pillNeutral }
                    : { label: t('ai.notInstalled'), className: styles.pillNeutral }
              return (
                <article className={styles.connectionCard} key={connection.backend}>
                  <ProviderMark backend={connection.backend} />
                  <div className={styles.connectionBody}>
                    <h3>{connection.label}</h3>
                    <p>{t(connection.backend === 'claude-code' ? 'ai.claude.description' : 'ai.codex.description')}</p>
                    <p className={styles.connectionDetail}>{connection.detail}</p>
                    {messages[connection.backend] !== undefined && messages[connection.backend] !== '' && (
                      <p className={styles.connectionDetail}>{messages[connection.backend]}</p>
                    )}
                  </div>
                  <span className={`${styles.pill} ${pill.className}`}>{pill.label}</span>
                  {cardActivity?.state === 'running' && (
                    <span className={`${styles.pill} ${styles.pillRunning}`}>{t('ai.pillRunning')}</span>
                  )}
                  {cardActivity !== undefined && cardActivity.state !== 'running' && (
                    <span className={`${styles.pill} ${styles.pillNeutral}`}>{t('ai.pillSelected', { model: cardActivity.model })}</span>
                  )}
                  <div className={styles.connectionFoot}>
                    {!connection.installed && (
                      <button type="button" className={styles.primary} disabled={cardBusy}
                        onClick={() => { void act(connection.backend, 'install') }}>
                        {cardBusy ? t('ai.working') : t('ai.install')}
                      </button>
                    )}
                    {connection.installed && connection.signedIn !== 'yes' && (
                      <button type="button" className={styles.primary} disabled={cardBusy}
                        onClick={() => { void act(connection.backend, 'signIn') }}>
                        {cardBusy ? t('ai.working') : t('ai.signIn')}
                      </button>
                    )}
                    {connection.installed && (
                      <button type="button" className={styles.secondary} disabled={cardBusy}
                        onClick={() => { void act(connection.backend, 'test') }}>
                        {busy === `${connection.backend}:test` ? t('ai.testing') : t('ai.test')}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>

          <div className={styles.apiCard} style={{ marginTop: 14 }}>
            <strong>{t('ai.model.title')}</strong>
            <p style={{ color: '#94918c', fontSize: 13, margin: '6px 0 0' }}>{t('ai.model.body')}</p>
            <ModelCard t={t} loadModels={loadModels} selectModel={selectModel} />
          </div>

          <div className={styles.apiCard} style={{ marginTop: 14 }}>
            <strong>{t('ai.noSubscription')}</strong>
            <p style={{ color: '#94918c', fontSize: 13, margin: '6px 0 0' }}>{t('ai.apiKeyBody')}</p>
            <ApiKeyCard t={t} saveApiKey={saveApiKey} testApiKey={testApiKey} deleteApiKey={deleteApiKey} apiKeyStatus={apiKeyStatus} />
          </div>

          <div className={styles.aiFooter} style={{ marginTop: 18 }}>
            <span className={styles.active}>
              {running !== undefined
                ? <>{t('ai.running', { name: labelOf(running.backend) })}</>
                : latest !== undefined
                  ? <>{t('ai.active')}: <strong>{labelOf(latest.backend)}</strong> · {latest.model}</>
                  : t('ai.noneActive')}
            </span>
            <button type="button" className={styles.secondary} onClick={() => { void refresh() }}>{t('ai.step1')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}


/** Stable option value for one provider/model pair. */
function modelKey(option: { readonly provider: string; readonly id: string }): string {
  return `${option.provider}::${option.id}`
}

/**
 * The model card: pick which relay model answers Edit Requests. The choice is
 * the default new Sessions start with; a Session's own model menu can still
 * override it for that Session.
 */
export function ModelCard({ t, loadModels, selectModel }: {
  t: (key: MotifCopy, vars?: Readonly<Record<string, string | number>>) => string
  loadModels: MotifInjected['loadModels'] | undefined
  selectModel: MotifInjected['selectModel'] | undefined
}) {
  const supported = loadModels !== undefined && selectModel !== undefined
  const [catalog, setCatalog] = useState<MotifModelCatalog | undefined>()
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | undefined>()

  useEffect(() => {
    if (loadModels === undefined) return
    let live = true
    loadModels().then(
      (next) => {
        if (!live) return
        setCatalog(next)
        const selected = next.options.find(option => option.provider === next.current.provider && option.id === next.current.model)
        setChoice(selected === undefined ? '' : modelKey(selected))
      },
      (reason: unknown) => {
        if (!live) return
        setCatalog(undefined)
        setResult({ ok: false, text: errorText(reason, t('ai.model.failed')) })
      },
    )
    return () => { live = false }
  }, [loadModels])

  if (!supported) {
    return <p className={styles.apiNote}>{t('ai.model.unavailable')}</p>
  }

  const currentKey = catalog === undefined ? '' : `${catalog.current.provider}::${catalog.current.model}`
  const dirty = catalog !== undefined && choice !== '' && choice !== currentKey

  const apply = async (): Promise<void> => {
    if (selectModel === undefined || catalog === undefined) return
    const option = catalog.options.find(candidate => modelKey(candidate) === choice)
    if (option === undefined) return
    setBusy(true)
    setResult(undefined)
    try {
      await selectModel(option.provider, option.id)
      setCatalog({ current: { provider: option.provider, model: option.id }, options: catalog.options })
      setResult({ ok: true, text: t('ai.model.saved', { name: `${option.providerLabel} · ${option.name}` }) })
    } catch (reason: unknown) {
      setResult({ ok: false, text: errorText(reason, t('ai.model.failed')) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.apiKeyCard}>
      <div className={styles.field}>
        <label htmlFor="motif-model-choice">{t('ai.model.label')}</label>
        <select
          id="motif-model-choice"
          value={choice}
          disabled={busy || catalog === undefined}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => { setChoice(event.target.value); setResult(undefined) }}
        >
          {choice === '' && <option value="" disabled>{t('ai.model.placeholder')}</option>}
          {(catalog?.options ?? []).map(option => (
            <option key={modelKey(option)} value={modelKey(option)}>{option.providerLabel} · {option.name}</option>
          ))}
        </select>
      </div>
      <div>
        <button type="button" className={styles.primary} disabled={busy || !dirty} onClick={() => { void apply() }}>
          {busy ? t('ai.working') : t('ai.model.apply')}
        </button>
      </div>
      {result !== undefined && (
        <p className={styles.apiNote} role={result.ok ? 'status' : 'alert'}>{result.text}</p>
      )}
    </div>
  )
}

/** Display message from one thrown value. */
function errorText(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback
}

/**
 * The no-subscription card: validate, store, and verify one provider API key,
 * and manage the stored key. The key value never leaves this card except to
 * the Host save/test Remotes.
 */
export function ApiKeyCard({ t, saveApiKey, testApiKey, deleteApiKey, apiKeyStatus }: {
  t: (key: MotifCopy, vars?: Readonly<Record<string, string | number>>) => string
  saveApiKey: MotifInjected['saveApiKey'] | undefined
  testApiKey: MotifInjected['testApiKey'] | undefined
  deleteApiKey: MotifInjected['deleteApiKey'] | undefined
  apiKeyStatus: MotifInjected['apiKeyStatus'] | undefined
}) {
  const supported = saveApiKey !== undefined && testApiKey !== undefined && deleteApiKey !== undefined && apiKeyStatus !== undefined
  const [provider, setProvider] = useState<MotifApiProvider>('anthropic')
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<MotifApiKeyStatus | undefined>()
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | undefined>()
  const [result, setResult] = useState<{ ok: boolean; text: string } | undefined>()

  useEffect(() => {
    if (apiKeyStatus === undefined) return
    let live = true
    apiKeyStatus(provider).then(
      (next) => { if (live) setStatus(next) },
      () => { if (live) setStatus(undefined) },
    )
    return () => { live = false }
  }, [apiKeyStatus, provider])

  const choose = (next: MotifApiProvider): void => {
    setProvider(next)
    setDraft('')
    setResult(undefined)
  }

  const save = async (): Promise<void> => {
    if (saveApiKey === undefined) return
    setBusy('save')
    setResult(undefined)
    try {
      const outcome = await saveApiKey({ provider, apiKey: draft })
      setDraft('')
      setStatus(outcome.status)
      setResult(outcome.test.ok
        ? { ok: true, text: t('ai.apiKey.saved') }
        : { ok: false, text: t('ai.apiKey.savedUnverified', { detail: outcome.test.detail }) })
    } catch (reason: unknown) {
      setResult({ ok: false, text: errorText(reason, t('ai.apiKey.failed')) })
    } finally {
      setBusy(undefined)
    }
  }

  const retest = async (): Promise<void> => {
    if (testApiKey === undefined) return
    setBusy('test')
    setResult(undefined)
    try {
      const outcome = await testApiKey({ provider })
      setResult(outcome.ok
        ? { ok: true, text: outcome.detail }
        : { ok: false, text: t('ai.apiKey.testFailed', { detail: outcome.detail }) })
    } catch (reason: unknown) {
      setResult({ ok: false, text: errorText(reason, t('ai.apiKey.failed')) })
    } finally {
      setBusy(undefined)
    }
  }

  const remove = async (): Promise<void> => {
    if (deleteApiKey === undefined || apiKeyStatus === undefined) return
    setBusy('remove')
    setResult(undefined)
    try {
      await deleteApiKey(provider)
      setStatus(await apiKeyStatus(provider))
      setResult({ ok: true, text: t('ai.apiKey.removed') })
    } catch (reason: unknown) {
      setResult({ ok: false, text: errorText(reason, t('ai.apiKey.failed')) })
    } finally {
      setBusy(undefined)
    }
  }

  if (!supported) {
    return <p className={styles.apiNote}>{t('ai.apiKey.unavailable')}</p>
  }

  return (
    <div className={styles.apiKeyCard}>
      <div className={styles.segmented} role="group" aria-label={t('ai.apiKey.provider')}>
        <button type="button" aria-pressed={provider === 'anthropic'} disabled={busy !== undefined}
          onClick={() => { choose('anthropic') }}>{t('ai.apiKey.provider.anthropic')}</button>
        <button type="button" aria-pressed={provider === 'openai'} disabled={busy !== undefined}
          onClick={() => { choose('openai') }}>{t('ai.apiKey.provider.openai')}</button>
      </div>
      {status?.configured === true && (
        <div className={styles.apiStored}>
          <span>{t('ai.apiKey.configured', { masked: status.masked ?? '' })}</span>
          <button type="button" className={styles.ghost} disabled={busy !== undefined} onClick={() => { void retest() }}>
            {busy === 'test' ? t('ai.apiKey.testing') : t('ai.apiKey.retest')}
          </button>
          <button type="button" className={styles.ghost} disabled={busy !== undefined} onClick={() => { void remove() }}>
            {busy === 'remove' ? t('ai.working') : t('ai.apiKey.remove')}
          </button>
        </div>
      )}
      <div className={styles.apiRow}>
        <input type="password" value={draft} placeholder={t('ai.apiKeyPlaceholder')} aria-label={t('ai.apiKeyPlaceholder')}
          disabled={busy !== undefined}
          onChange={(event) => { setDraft(event.target.value) }} />
        <button type="button" className={styles.secondary} disabled={busy !== undefined || draft.trim() === ''}
          onClick={() => { void save() }}>
          {busy === 'save' ? t('ai.apiKey.saving') : t('ai.saveAndTest')}
        </button>
      </div>
      {result !== undefined && (
        <p className={result.ok ? styles.apiResultOk : styles.apiResultError} role={result.ok ? 'status' : 'alert'}>{result.text}</p>
      )}
    </div>
  )
}

function BrandArt({ brand }: { brand: MotifBrand }) {
  const { identity } = brand
  return (
    <div className={styles.brandArt} style={{
      background: `linear-gradient(140deg, ${identity.primary} 0%, ${identity.dark} 100%)`,
      fontFamily: `'${identity.latinFont}', sans-serif`,
    }}>
      <span className={styles.brandArtTitle} style={{ background: identity.accent, color: identity.dark }}>
        {brand.name.split(' ')[0] ?? brand.name}
      </span>
      <span className={styles.brandArtTag} style={{ background: identity.primary, color: '#fff' }}>
        [NAME] · {brand.name}
      </span>
      <span className={styles.brandArtArabic} style={{ color: identity.accent, fontFamily: `'${identity.arabicFont}', sans-serif` }}>
        {brand.name}
      </span>
    </div>
  )
}

/**
 * Brands page: saved identity cards, the New Brand entry, and the three start
 * paths the product offers.
 * @param props - slot inject face.
 * @returns the Brands section.
 */
export function BrandsSection({ t = key => key, load, createBrand, openBrand, analyzeWebsite, loadTimeline, sendEditRequest }: Props) {
  const { snapshot, error, loading, refresh } = useSnapshot(load)
  const [creating, setCreating] = useState(false)
  const [prefill, setPrefill] = useState<{ name?: string; identity: MotifBrandIdentity; source: string } | undefined>()
  const [websiteFlow, setWebsiteFlow] = useState(false)
  const [editing, setEditing] = useState<MotifBrand | undefined>()
  const [query, setQuery] = useState('')
  const brands = snapshot?.brands ?? []
  const problems = snapshot?.brandProblems ?? []
  const visible = useMemo(() => brands.filter(brand => brand.name.toLowerCase().includes(query.trim().toLowerCase())), [brands, query])

  if (creating) {
    // Creation cards are only clickable with a Host injection; a missing one is a wiring bug, not user input.
    if (createBrand === undefined) throw new Error('MOTIF: Brand creation requested without a Host createBrand injection')
    const create = createBrand
    return (
      <NewBrand t={t} initial={prefill} onCancel={() => { setCreating(false); setPrefill(undefined) }} onCreated={async (request) => {
        const result = await create(request)
        await refresh()
        setCreating(false)
        setPrefill(undefined)
        openBrand?.(result.workspaceId)
      }} />
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <h1>{t('brands.title')}</h1>
          <p>{t('brands.intro')}</p>
        </div>
        <div className={styles.searchRow}>
          <input value={query} placeholder={t('brands.search')} aria-label={t('brands.search')}
            onChange={(event) => { setQuery(event.target.value) }} />
          <button type="button" className={styles.primary} onClick={() => { setCreating(true) }}>+ {t('brands.new')}</button>
        </div>
      </div>

      {loading && <div className={styles.empty}>{t('brands.loading')}</div>}
      {error && <div className={styles.empty}>{t('brands.failed')}</div>}
      {!loading && !error && problems.length > 0 && (
        <div className={styles.problems} role="alert">
          <div className={styles.problemsTitle}>{t('brands.problems.title')}</div>
          {problems.map(problem => (
            <div className={styles.problemRow} key={problem.path}>
              <span>{problem.kind === 'corrupt'
                ? t('brands.problems.corrupt', { path: problem.path })
                : t('brands.problems.unreadable', { path: problem.path })}</span>
              <button type="button" className={styles.secondary} onClick={() => { void refresh() }}>
                {t('brands.problems.reload')}
              </button>
            </div>
          ))}
        </div>
      )}
      {!loading && !error && visible.length > 0 && (
        <div className={styles.grid}>
          {visible.map(brand => (
            <article className={styles.brandCard} key={brand.id}>
              <BrandArt brand={brand} />
              <div className={styles.brandBody}>
                <div>
                  <div className={styles.brandName}>{brand.name}</div>
                  <div className={styles.brandMeta}>{t('brands.videos', { count: brand.videoCount })}</div>
                </div>
                <div className={styles.cardActions}>
                  <button type="button" className={styles.secondary} disabled={brand.workspaceId === undefined}
                    onClick={() => {
                      setEditing(brand)
                      if (brand.workspaceId !== undefined) openBrand?.(brand.workspaceId)
                    }}>
                    {t('brands.open')}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {!loading && !error && visible.length === 0 && <div className={styles.empty}>{t('brands.empty')}</div>}

      <div>
        <h2 className={styles.sectionTitle} style={{ marginBottom: 12 }}>{t('brands.start')}</h2>
        <div className={styles.startGrid}>
          <button type="button" className={styles.startCard} onClick={() => { setPrefill(undefined); setCreating(true) }}>
            <strong>{t('brands.manually')}</strong><span>{t('brands.manually.body')}</span>
          </button>
          <button type="button" className={styles.startCard} disabled={analyzeWebsite === undefined}
            title={analyzeWebsite === undefined ? t('brands.fromWebsite.unavailable') : undefined}
            onClick={() => { setWebsiteFlow(open => !open) }}>
            <strong>{t('brands.fromWebsite')}</strong><span>{t('brands.fromWebsite.body')}</span>
          </button>
          <button type="button" className={styles.startCard} disabled>
            <strong>{t('brands.fromVideo')}</strong><span>{t('brands.fromVideo.unavailable')}</span>
          </button>
        </div>
        {websiteFlow && analyzeWebsite !== undefined && (
          <WebsiteStart t={t} analyzeWebsite={analyzeWebsite}
            onCancel={() => { setWebsiteFlow(false) }}
            onAnalyzed={(suggestion) => {
              setWebsiteFlow(false)
              setPrefill({
                ...suggestion.name === undefined ? {} : { name: suggestion.name },
                identity: suggestion.identity,
                source: suggestion.source,
              })
              setCreating(true)
            }} />
        )}
      </div>
      {editing !== undefined && <BrandEditor brand={editing} t={t} onClose={() => { setEditing(undefined) }}
        loadTimeline={loadTimeline} sendEditRequest={sendEditRequest} />}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.field}><label>{label}</label>{children}</div>
}

function Segmented<T extends string>({ value, options, onChange }: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className={styles.segmented}>
      {options.map(option => (
        <button type="button" key={option.value} aria-pressed={value === option.value}
          onClick={() => { onChange(option.value) }}>{option.label}</button>
      ))}
    </div>
  )
}

export interface MotifBrandCreateInitial {
  /** Suggested Brand name, when known. */
  name?: string
  /** Suggested identity tokens. */
  identity: MotifBrandIdentity
  /** Human-readable origin of the suggestion (for example, the analyzed URL). */
  source: string
}

function NewBrand({ t, initial, onCancel, onCreated }: {
  t: (key: MotifCopy, vars?: Readonly<Record<string, string | number>>) => string
  initial?: MotifBrandCreateInitial | undefined
  onCancel: () => void
  onCreated: (request: MotifBrandCreateRequest) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [identity, setIdentity] = useState<MotifBrandIdentity>(initial?.identity ?? FALLBACK_IDENTITY)
  const [logo, setLogo] = useState<string | undefined>()
  const [logoName, setLogoName] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const set = <K extends keyof MotifBrandIdentity>(key: K, value: MotifBrandIdentity[K]): void => {
    setIdentity(previous => ({ ...previous, [key]: value }))
  }

  const [uploading, setUploading] = useState(false)
  const uploadSequence = useRef(0)
  const upload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    const sequence = ++uploadSequence.current
    setUploading(false)
    event.target.value = ''
    setError(undefined)
    if (!file) return
    // Reject before reading the file into memory.
    if (file.size === 0 || file.size > MAX_LOGO_BYTES) {
      setError('Logo must be between 1 byte and 2 MiB')
      return
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Choose a PNG, JPEG, or WebP logo. SVG is not supported')
      return
    }
    setUploading(true)
    const reader = new FileReader()
    reader.onload = () => {
      if (sequence !== uploadSequence.current) return
      try {
        const bytes = new Uint8Array(reader.result as ArrayBuffer)
        validateLogoBytes(bytes, file.type)
        let binary = ''
        for (const byte of bytes) binary += String.fromCharCode(byte)
        setLogo(`data:${file.type};base64,${btoa(binary)}`)
        setLogoName(file.name)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not read logo')
      } finally { setUploading(false) }
    }
    reader.onerror = () => {
      if (sequence === uploadSequence.current) { setError('Could not read logo'); setUploading(false) }
    }
    reader.readAsArrayBuffer(file)
  }

  const save = async (): Promise<void> => {
    setError(undefined)
    if (name.trim() === '') {
      setError(t('brand.form.required'))
      return
    }
    setSaving(true)
    try {
      await onCreated({ name: name.trim(), identity, ...logo === undefined ? {} : { logo } })
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : t('brand.form.failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.root}>
      <button type="button" className={styles.ghost} style={{ alignSelf: 'flex-start' }} onClick={onCancel}>← {t('brand.form.back')}</button>
      <div className={styles.headerCopy}>
        <h1>{t('brand.form.title')}</h1>
      </div>
      <div className={styles.form}>
        <div>
          {initial !== undefined
            ? <div className={styles.review}>{t('brands.flow.website.prefilled', { source: initial.source })}</div>
            : <div className={styles.review}>{t('brand.form.review')}</div>}
          <div className={styles.panel}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <Field label={t('brand.form.name')}>
                <input value={name} placeholder={t('brand.form.namePlaceholder')} onChange={(event) => { setName(event.target.value) }} autoFocus />
              </Field>
            </div>

            <div className={styles.logoRow} style={{ marginBottom: 16 }}>
              <div className={styles.logoPreview}>
                {logo === undefined ? (name.trim().charAt(0).toUpperCase() || 'M') : <img src={logo} alt="" />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{t('brand.form.logo')}</div>
                <div style={{ color: '#8f8c87', fontSize: 12 }}>{logoName ?? t('brand.form.logoBody')}</div>
              </div>
              <label className={styles.secondary} style={{ cursor: 'pointer' }}>
                {logo === undefined ? t('brand.form.upload') : t('brand.form.replace')}
                <input type="file" accept="image/png,image/jpeg,image/webp" aria-label={t('brand.form.logo')} disabled={uploading} style={{ display: 'none' }} onChange={upload} />
              </label>
            </div>

            <h2>{t('brand.form.colors')}</h2>
            <div className={styles.colorGrid}>
              {([
                ['primary', 'brand.form.primary'],
                ['accent', 'brand.form.accent'],
                ['light', 'brand.form.light'],
                ['dark', 'brand.form.dark'],
              ] as const).map(([key, label]) => (
                <Field key={key} label={t(label)}>
                  <input type="color" value={identity[key]} onChange={(event) => { set(key, event.target.value.toUpperCase()) }
                  } />
                  <code>{identity[key]}</code>
                </Field>
              ))}
            </div>

            <h2 style={{ marginTop: 18 }}>{t('brand.form.fonts')}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label={t('brand.form.latinFont')}>
                <input value={identity.latinFont} onChange={(event) => { set('latinFont', event.target.value) }} />
              </Field>
              <Field label={t('brand.form.arabicFont')}>
                <input value={identity.arabicFont} onChange={(event) => { set('arabicFont', event.target.value) }} />
              </Field>
            </div>

            <Field label={t('brand.form.motion')}>
              <Segmented value={identity.motion as 'soft' | 'snap' | 'fade'} options={[
                { value: 'soft', label: t('brand.form.motionSoft') },
                { value: 'snap', label: t('brand.form.motionSnap') },
                { value: 'fade', label: t('brand.form.motionFade') },
              ]} onChange={(value) => { set('motion', value) }} />
            </Field>
            <Field label={t('brand.form.caption')}>
              <Segmented value={identity.caption as 'word' | 'plain' | 'boxed'} options={[
                { value: 'word', label: t('brand.form.captionWord') },
                { value: 'plain', label: t('brand.form.captionPlain') },
                { value: 'boxed', label: t('brand.form.captionBoxed') },
              ]} onChange={(value) => { set('caption', value) }} />
            </Field>
          </div>
        </div>

        <div className={styles.preview}>
          <h2>{t('brand.form.preview')}</h2>
          <div className={styles.previewFrame} style={{
            background: `radial-gradient(120% 120% at 20% 0%, ${identity.primary} 0%, ${identity.dark} 72%)`,
            fontFamily: `'${identity.latinFont}', sans-serif`,
          }}>
            <span className={styles.previewTitle} style={{ background: identity.accent, color: identity.dark }}>
              {t('brand.form.titleSample')}
            </span>
            <div>
              <div className={styles.previewLower} style={{ background: identity.primary }}>
                <strong>[NAME]</strong>{name.trim() || 'Nakheel Café'}
              </div>
              <div className={styles.previewCaption} style={{
                background: identity.light,
                color: identity.dark,
                padding: '10px 8px',
                borderRadius: 4,
                marginTop: 10,
                direction: 'rtl',
                fontFamily: `'${identity.arabicFont}', sans-serif`,
              }}>
                <span>{t('brand.form.captionArabic')}</span>
                <small>{t('brand.form.captionSample')}</small>
              </div>
            </div>
          </div>
          <div className={styles.brandMeta}>
            {identity.latinFont} · {identity.arabicFont} · {identity.motion} · {identity.caption}
          </div>
        </div>

        {error !== undefined && <div className={`${styles.error} ${styles.formFooter}`}>{error}</div>}
        <div className={styles.formFooter}>
          <button type="button" className={styles.secondary} onClick={onCancel} disabled={saving || uploading}>{t('brand.form.cancel')}</button>
          <button type="button" className={styles.primary} onClick={() => { void save() }} disabled={saving || uploading}>
            {saving ? t('brand.form.saving') : t('brand.form.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Props the settings shell passes to the first-run connection step. */
export interface MotifOnboardingProps extends Partial<MotifInjected> {
  /** Shell-owned completion callback; persists that this step was seen. */
  complete?: () => void
  /** Open a settings section by id. */
  openSection?: (id: string) => void
}

/**
 * First-run step for the connection check: the product asks once, shows what
 * it found, and hands the install/sign-in work to the AI settings page.
 * @param props - injected Motif face plus the shell's completion callbacks.
 * @returns a modal welcome card that never blocks the app after dismissal.
 */
export function MotifOnboarding({ t = key => key, load, complete, openSection }: MotifOnboardingProps) {
  const { snapshot } = useSnapshot(load)
  const connections = snapshot?.connections ?? []
  const ready = connections.filter(connection => connection.signedIn === 'yes').length
  const total = connections.length === 0 ? 2 : connections.length

  const finish = (): void => { complete?.() }
  return (
    <div className={styles.gate} role="dialog" aria-modal="true" aria-label={t('onboarding.title')}>
      <div className={styles.gateCard}>
        <div className={styles.gateMark} aria-hidden="true">M</div>
        <h2 className={styles.gateTitle}>{t('onboarding.title')}</h2>
        <p className={styles.gateBody}>{t('onboarding.body')}</p>
        <ol className={styles.gateSteps}>
          <li><span>1</span>{t('onboarding.step1')}</li>
          <li><span>2</span>{t('onboarding.step2')}</li>
          <li><span>3</span>{t('onboarding.step3')}</li>
        </ol>
        <p className={styles.gateStatus}>{t('onboarding.ready', { ready, total })}</p>
        <div className={styles.gateActions}>
          <button type="button" className={styles.ghost} onClick={finish}>{t('onboarding.later')}</button>
          <button type="button" className={styles.primary} onClick={() => { openSection?.('motif-ai'); finish() }}>
            {t('onboarding.setup')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** One Brand's editing surface: request history, preview, timeline, identity. */
/** One Edit Request submitted from this editor, with its delivery state. */
interface EditorRequest {
  readonly id: number
  readonly text: string
  readonly state: 'sending' | 'sent' | 'failed' | 'cancelled'
  readonly detail: string
}

/** Format one byte count for the timeline list. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const REQUEST_STATE_COPY = {
  sending: 'editor.state.sending',
  sent: 'editor.state.sent',
  failed: 'editor.state.failed',
  cancelled: 'editor.state.cancelled',
} as const

/**
 * Brand editor: the composer submits Edit Requests to the Brand's real
 * workspace Session (the session/relay flow), and the timeline lists the
 * Brand folder's real timeline files. Controls without a real flow behind
 * them, such as Export, stay disabled with an explanation instead of
 * pretending to work.
 * @param props - the Brand, the injected services, and the close handler.
 * @returns the editor dialog.
 */
export function WebsiteStart({ t, analyzeWebsite, onCancel, onAnalyzed }: {
  t: (key: MotifCopy, vars?: Readonly<Record<string, string | number>>) => string
  analyzeWebsite: MotifInjected['analyzeWebsite']
  onCancel: () => void
  onAnalyzed: (suggestion: MotifWebsiteSuggestion) => void
}) {
  const [url, setUrl] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const abortRef = useRef<AbortController | undefined>()

  const analyze = async (): Promise<void> => {
    const trimmed = url.trim()
    setError(undefined)
    if (!/^https?:\/\/.+/i.test(trimmed)) {
      setError(t('brands.flow.website.invalid'))
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setAnalyzing(true)
    try {
      const suggestion = await analyzeWebsite(trimmed, controller.signal)
      if (!controller.signal.aborted) {
        onAnalyzed(suggestion)
      }
    } catch (reason: unknown) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : t('brands.flow.website.failed'))
      }
    } finally {
      setAnalyzing(false)
      abortRef.current = undefined
    }
  }

  const cancel = (): void => {
    abortRef.current?.abort()
    onCancel()
  }

  return (
    <form className={styles.websiteFlow} onSubmit={(event) => { event.preventDefault(); void analyze() }}>
      <label className={styles.websiteFlowLabel}>
        {t('brands.flow.website.label')}
        <input value={url} placeholder={t('brand.form.websitePlaceholder')} aria-label={t('brands.flow.website.label')}
          disabled={analyzing} onChange={(event) => { setUrl(event.target.value) }} />
      </label>
      {analyzing
        ? <button type="button" className={styles.secondary} onClick={cancel}>{t('brands.flow.website.cancel')}</button>
        : <button type="submit" className={styles.primary}>{t('brands.flow.website.action')}</button>}
      {analyzing && <span className={styles.websiteFlowStatus}>{t('brands.flow.website.analyzing')}</span>}
      {error !== undefined && <p className={styles.websiteFlowError} role="alert">{error}</p>}
    </form>
  )
}

export function BrandEditor({ brand, t = key => key, onClose, loadTimeline, sendEditRequest }: {
  brand: MotifBrand
  t?: MotifInjected['t']
  onClose: () => void
  loadTimeline?: MotifInjected['loadTimeline'] | undefined
  sendEditRequest?: MotifInjected['sendEditRequest'] | undefined
}) {
  const { identity } = brand
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    dialogRef.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
      ))
      const first = controls[0]
      const last = controls.at(-1)
      if (!first || !last) { event.preventDefault(); dialog.focus(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault(); first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  const [draft, setDraft] = useState('')
  const [requests, setRequests] = useState<readonly EditorRequest[]>([])
  const nextRequestId = useRef(1)
  const abortRef = useRef<AbortController | undefined>(undefined)
  const [timeline, setTimeline] = useState<readonly MotifTimelineEntry[] | undefined>(undefined)
  const [timelineState, setTimelineState] = useState<'loading' | 'ready' | 'failed'>(
    loadTimeline === undefined ? 'failed' : 'loading',
  )

  const reloadTimeline = useCallback(async (): Promise<void> => {
    if (loadTimeline === undefined) {
      setTimelineState('failed')
      return
    }
    setTimelineState('loading')
    try {
      setTimeline(await loadTimeline(brand))
      setTimelineState('ready')
    } catch {
      setTimelineState('failed')
    }
  }, [brand, loadTimeline])

  useEffect(() => {
    void reloadTimeline()
  }, [reloadTimeline])

  const sending = requests.some(request => request.state === 'sending')
  const canSend = sendEditRequest !== undefined && brand.workspaceId !== undefined

  const submit = async (): Promise<void> => {
    const text = draft.trim()
    if (text === '' || sendEditRequest === undefined || !canSend || sending) return
    const controller = new AbortController()
    abortRef.current = controller
    const id = nextRequestId.current++
    setRequests(previous => [{ id, text, state: 'sending', detail: '' }, ...previous])
    setDraft('')
    try {
      const result = await sendEditRequest(brand, text, controller.signal)
      const state = result.ok ? 'sent' : controller.signal.aborted ? 'cancelled' : 'failed'
      setRequests(previous => previous.map(request => request.id === id
        ? { ...request, state, detail: result.message }
        : request))
      if (result.ok) await reloadTimeline()
    } catch (reason: unknown) {
      const detail = reason instanceof Error ? reason.message : String(reason)
      setRequests(previous => previous.map(request => request.id === id
        ? { ...request, state: controller.signal.aborted ? 'cancelled' : 'failed', detail }
        : request))
    } finally {
      abortRef.current = undefined
    }
  }

  return (
    <div ref={dialogRef} tabIndex={-1} className={styles.editor} role="dialog" aria-modal="true" aria-label={brand.name}>
      <header className={styles.editorBar}>
        <button type="button" className={styles.ghost} onClick={onClose}>← {t('editor.back')}</button>
        <div className={styles.editorName}>{brand.name}</div>
        <span className={styles.exportGroup}>
          <button type="button" className={styles.primary} disabled aria-describedby="motif-export-note">
            {t('editor.export')}
          </button>
          <span className={styles.exportNote} id="motif-export-note">{t('editor.exportUnavailable')}</span>
        </span>
      </header>
      <div className={styles.editorBody}>
        <aside className={styles.editorChat}>
          <div className={styles.chatHead}>
            <h3>{t('editor.editRequest')}</h3>
            <span data-available={canSend}>{canSend ? t('editor.ready') : t('editor.unavailable')}</span>
          </div>
          <div className={styles.requestList}>
            {requests.length === 0 && <p className={styles.emptyNote}>{t('editor.noRequests')}</p>}
            {requests.map(request => (
              <div className={styles.request} data-state={request.state} key={request.id}>
                <div className={styles.requestMeta}>{t(REQUEST_STATE_COPY[request.state])}</div>
                <p>{request.text}</p>
                {request.detail !== '' && <p className={styles.requestDetail}>{request.detail}</p>}
              </div>
            ))}
          </div>
          <form className={styles.composerRow} onSubmit={(event) => { event.preventDefault(); void submit() }}>
            <input value={draft} placeholder={t('editor.requestPlaceholder')} aria-label={t('editor.editRequest')}
              disabled={!canSend || sending}
              onChange={(event: ChangeEvent<HTMLInputElement>) => { setDraft(event.target.value) }} />
            {sending
              ? <button type="button" className={styles.secondary} onClick={() => { abortRef.current?.abort() }}>{t('editor.cancel')}</button>
              : <button type="submit" className={styles.primary} disabled={!canSend || draft.trim() === ''}>{t('editor.send')}</button>}
          </form>
          {!canSend && <p className={styles.composerHint}>{t('editor.sendUnavailable')}</p>}
        </aside>
        <main className={styles.editorStage}>
          <div className={styles.previewFrame} style={{ background: identity.dark }}>
            {brand.logo !== undefined && <img className={styles.previewLogo} src={brand.logo} alt={brand.name} />}
            <div className={styles.previewType} style={{ color: identity.light, fontFamily: `'${identity.latinFont}', sans-serif` }}>
              {brand.name}
            </div>
            <div className={styles.previewBar} style={{ background: identity.accent }} />
            <div className={styles.previewArabic} style={{ color: identity.light, fontFamily: `'${identity.arabicFont}', sans-serif` }}>
              {brand.name}
            </div>
          </div>
          <div className={styles.inUseCard}>
            <div>
              <strong>{t('editor.inUse')}</strong>
              <p>{brand.name} · {identity.latinFont} / {identity.arabicFont}</p>
            </div>
            <div className={styles.swatches}>
              {[identity.primary, identity.accent, identity.light, identity.dark].map(colour => (
                <span key={colour} style={{ background: colour }} />
              ))}
            </div>
          </div>
          <section className={styles.timeline} aria-label={t('editor.timeline')}>
            <h3 className={styles.timelineTitle}>{t('editor.timeline')}</h3>
            {timelineState === 'loading' && <p className={styles.emptyNote}>{t('editor.timelineLoading')}</p>}
            {timelineState === 'failed' && <p className={styles.emptyNote}>{t('editor.timelineFailed')}</p>}
            {timelineState === 'ready' && timeline !== undefined && timeline.length === 0 && (
              <p className={styles.emptyNote}>{t('editor.timelineEmpty')}</p>
            )}
            {timelineState === 'ready' && timeline !== undefined && timeline.length > 0 && (
              <ul className={styles.timelineList}>
                {timeline.map(entry => (
                  <li className={styles.timelineRow} key={entry.name}>
                    <span className={styles.timelineName}>{entry.name}</span>
                    <span className={styles.timelineMeta}>
                      {formatBytes(entry.bytes)} · {new Date(entry.updatedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}

/** Blank-session home: the Brands page replaces the generic chat hero. */
export function MotifHome({ t = key => key, load, createBrand, openBrand }: Props) {
  const { snapshot } = useSnapshot(load)
  const activity = snapshot?.activity ?? []
  const running = activity.find(entry => entry.state === 'running')
  const latest = activity[0]
  return (
    <div className={styles.home}>
      <BrandsSection t={t} load={load} createBrand={createBrand} openBrand={openBrand} />
      <div className={styles.homeStatus}>
        <span />
        {running !== undefined
          ? t('editor.aiRunning', { name: running.model })
          : latest !== undefined
            ? t('editor.aiActive', { name: latest.model })
            : t('ai.noneActive')}
      </div>
    </div>
  )
}

/** Frame hoc: keep the conversation body untouched once a Brand is open. */
export function MotifHomeFrame({ hero, children, t, load, createBrand, openBrand, developerMode }: Props & {
  hero: boolean
  children?: ReactNode
}) {
  const developer = useDeveloperMode(developerMode)
  if (!hero || developer) return <>{children}</>
  return <MotifHome t={t} load={load} createBrand={createBrand} openBrand={openBrand} />
}
