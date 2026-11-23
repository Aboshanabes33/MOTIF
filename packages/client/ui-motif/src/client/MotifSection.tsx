import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import type { MotifBrand, MotifBrandCreateRequest, MotifBrandIdentity, MotifConnection, MotifSnapshot, MotifWebsiteSuggestion } from '@deepseek-ai/dsh-motif-core/types'
import type { MotifCopy } from './locales.ts'
import styles from './MotifSection.module.css'

/** Values every Motif settings surface receives through its slot `inject`. */
export interface MotifInjected {
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
  /**
   * Analyze one public web page into a Brand identity suggestion. Aborting the
   * signal stops the wait; the bounded host fetch may finish in the background.
   */
  analyzeWebsite: (url: string, signal: AbortSignal) => Promise<MotifWebsiteSuggestion>
}

type Props = { [K in keyof MotifInjected]?: MotifInjected[K] | undefined }

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
export function AiSection({ t = key => key, load, install, signIn, test }: Props) {
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

  const connected = snapshot?.connections.find(connection => connection.signedIn === 'yes')

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
            <strong>{t('ai.noSubscription')}</strong>
            <p style={{ color: '#94918c', fontSize: 13, margin: '6px 0 0' }}>{t('ai.apiKeyBody')}</p>
            <div className={styles.apiRow}>
              <input type="password" placeholder={t('ai.apiKeyPlaceholder')} aria-label={t('ai.apiKeyPlaceholder')} />
              <button type="button" className={styles.secondary}>{t('ai.saveAndTest')}</button>
            </div>
          </div>

          <div className={styles.aiFooter} style={{ marginTop: 18 }}>
            <span className={styles.active}>
              {connected === undefined
                ? t('ai.noneActive')
                : <>{t('ai.active')}: <strong>{connected.label}</strong> · {t('ai.connected')}</>}
            </span>
            <button type="button" className={styles.secondary} onClick={() => { void refresh() }}>{t('ai.step1')}</button>
          </div>
        </div>
      </div>
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
export function BrandsSection({ t = key => key, load, createBrand, openBrand, analyzeWebsite }: Props) {
  const { snapshot, error, loading, refresh } = useSnapshot(load)
  const [creating, setCreating] = useState(false)
  const [prefill, setPrefill] = useState<{ name?: string; identity: MotifBrandIdentity; source: string } | undefined>()
  const [websiteFlow, setWebsiteFlow] = useState(false)
  const [editing, setEditing] = useState<MotifBrand | undefined>()
  const [query, setQuery] = useState('')
  const brands = snapshot?.brands ?? []
  const visible = useMemo(() => brands.filter(brand => brand.name.toLowerCase().includes(query.trim().toLowerCase())), [brands, query])

  if (creating) {
    return (
      <NewBrand t={t} initial={prefill} onCancel={() => { setCreating(false); setPrefill(undefined) }} onCreated={async (request) => {
        if (createBrand === undefined) throw new Error('MOTIF: Brand creation requested without a Host createBrand injection')
        const result = await createBrand(request)
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
      {editing !== undefined && <BrandEditor brand={editing} t={t} onClose={() => { setEditing(undefined) }} />}
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

  const upload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    if (file === undefined) return
    const reader = new FileReader()
    reader.onload = () => {
      setLogo(typeof reader.result === 'string' ? reader.result : undefined)
      setLogoName(file.name)
    }
    reader.readAsDataURL(file)
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
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{ display: 'none' }} onChange={upload} />
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
          <button type="button" className={styles.secondary} onClick={onCancel} disabled={saving}>{t('brand.form.cancel')}</button>
          <button type="button" className={styles.primary} onClick={() => { void save() }} disabled={saving}>
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

function BrandEditor({ brand, t = key => key, onClose }: {
  brand: MotifBrand
  t?: MotifInjected['t']
  onClose: () => void
}) {
  const { identity } = brand
  const lanes: readonly { key: MotifCopy; clips: readonly [number, number][] }[] = [
    { key: 'editor.video', clips: [[0, 62], [64, 88]] },
    { key: 'editor.captions', clips: [[4, 28], [32, 58], [62, 88]] },
    { key: 'editor.titles', clips: [[0, 18], [40, 52]] },
    { key: 'editor.motion', clips: [[8, 16], [56, 70]] },
    { key: 'editor.audio', clips: [[0, 100]] },
  ]
  return (
    <div className={styles.editor} role="dialog" aria-modal="true" aria-label={brand.name}>
      <header className={styles.editorBar}>
        <button type="button" className={styles.ghost} onClick={onClose}>← {t('editor.back')}</button>
        <div className={styles.editorName}>{brand.name}</div>
        <button type="button" className={styles.primary}>{t('editor.export')}</button>
      </header>
      <div className={styles.editorBody}>
        <aside className={styles.editorChat}>
          <div className={styles.chatHead}>
            <h3>{t('editor.editRequest')}</h3>
            <span>{t('editor.ready')}</span>
          </div>
          <div className={styles.requestList}>
            <div className={styles.request} data-latest="true">
              <div className={styles.requestMeta}>{t('editor.version')}</div>
              <p>{t('editor.requestPlaceholder')}</p>
            </div>
          </div>
          <div className={styles.composerRow}>
            <input placeholder={t('editor.requestPlaceholder')} aria-label={t('editor.editRequest')} />
            <button type="button" className={styles.primary}>{t('editor.send')}</button>
          </div>
        </aside>
        <main className={styles.editorStage}>
          <div className={styles.previewFrame} style={{ background: identity.dark }}>
            <div className={styles.previewType} style={{ color: identity.light, fontFamily: `'${identity.latinFont}', sans-serif` }}>
              {brand.name}
            </div>
            <div className={styles.previewBar} style={{ background: identity.accent }} />
            <div className={styles.previewArabic} style={{ color: identity.light, fontFamily: `'${identity.arabicFont}', sans-serif` }}>
              {t('brand.form.captionArabic')}
            </div>
          </div>
          <div className={styles.transport}>
            <span>0:13</span>
            <input type="range" min={0} max={22} defaultValue={13} aria-label={t('editor.timeline')} />
            <span>0:22</span>
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
            <em>{t('editor.handEdits')}</em>
          </div>
          <div className={styles.lanes}>
            {lanes.map(lane => (
              <div className={styles.lane} key={lane.key}>
                <span className={styles.laneName}>{t(lane.key)}</span>
                <div className={styles.laneTrack}>
                  {lane.clips.map(([start, end]) => (
                    <span key={`${start}-${end}`} style={{ left: `${start}%`, width: `${end - start}%`, background: identity.primary }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}

/** Blank-session home: the Brands page replaces the generic chat hero. */
export function MotifHome({ t = key => key, load, createBrand, openBrand }: Props) {
  return (
    <div className={styles.home}>
      <BrandsSection t={t} load={load} createBrand={createBrand} openBrand={openBrand} />
      <div className={styles.homeStatus}>
        <span />
        {t('editor.aiActive', { name: 'Claude Code' })}
      </div>
    </div>
  )
}

/** Frame hoc: keep the conversation body untouched once a Brand is open. */
export function MotifHomeFrame({ hero, children, t, load, createBrand, openBrand }: Props & {
  hero: boolean
  children?: ReactNode
}) {
  if (!hero) return <>{children}</>
  return <MotifHome t={t} load={load} createBrand={createBrand} openBrand={openBrand} />
}
