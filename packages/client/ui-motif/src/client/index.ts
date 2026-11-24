import { DeveloperModeSection } from './DeveloperMode.tsx'
/** Motif settings surfaces: the AI-connection onboarding and Brand management. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-motif-core/remote'
import type { MotifBrand, MotifSnapshot, MotifTimelineEntry, MotifWebsiteSuggestion } from '@deepseek-ai/dsh-motif-core/types'
import { AiSection, BrandsSection, MotifHomeFrame, MotifOnboarding, type MotifInjected, type MotifModelCatalog, type MotifModelOption } from './MotifSection.tsx'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'
import { ar, en, zh, type MotifCopy } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Motif's onboarding and Brand copy. */
    'settings.motif': MotifCopy
  }
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    /** Edit Requests the Brand editor sends into a Brand workspace Session. */
    motifEditRequest: unknown
  }
}

/** Services the surfaces use. */
export const inject = ['slots', 'locale', 'remote', 'remote.motif', 'remote.session', 'uiWorkspace', 'workspaces', 'sessions', 'configForms']

/** Locale namespace owned by this package. */
const NS = 'settings.motif'

async function valueOf<T>(answer: Promise<RemoteResult<T>>): Promise<T> {
  const result = await answer
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/**
 * Register the two Motif settings sections.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh, ar }), 'ui-motif: dictionaries')
  const translate = ctx.locale.bind(NS)
  const t = (key: MotifCopy, vars?: Readonly<Record<string, string | number>>): string => translate(key, vars)

  const face = (): MotifInjected => ({
    developerMode: ctx.configForms.developerTools,
    t,
    load: () => valueOf<MotifSnapshot>(ctx.remote.motif.snapshot()),
    install: backend => valueOf(ctx.remote.motif.installBackend({ backend })),
    signIn: backend => valueOf(ctx.remote.motif.signIn({ backend })),
    test: backend => valueOf(ctx.remote.motif.test({ backend })),
    createBrand: request => valueOf(ctx.remote.motif.createBrand(request)),
    saveApiKey: request => valueOf(ctx.remote.motif.saveApiKey(request)),
    testApiKey: request => valueOf(ctx.remote.motif.testApiKey(request)),
    deleteApiKey: provider => valueOf(ctx.remote.motif.deleteApiKey({ provider })),
    apiKeyStatus: provider => valueOf(ctx.remote.motif.apiKeyStatus({ provider })),
    loadModels: async (): Promise<MotifModelCatalog> => {
      const catalog = await valueOf<ModelCatalog>(ctx.remote.session.modelCatalog())
      return {
        current: { provider: catalog.default.provider, model: catalog.default.model },
        options: catalog.groups.filter(group => group.id.startsWith('motif-relay-')).flatMap((group): MotifModelOption[] =>
          group.models.map(model => ({
            provider: group.id,
            providerLabel: group.name,
            id: model.id,
            name: model.name,
            ...model.description === undefined ? {} : { description: model.description },
          })),
        ),
      }
    },
    selectModel: async (provider, model) => {
      const value = await valueOf<{ selected: { provider: string; model: string } }>(
        ctx.remote.session.selectDefaultModel({ provider, model }),
      )
      return { provider: value.selected.provider, model: value.selected.model }
    },
    analyzeWebsite: async (url, signal) => {
      // Typert Remotes cannot be aborted mid-call: race the one bounded host
      // fetch against the AbortSignal so the UI can leave immediately. The
      // host-side fetch is capped (timeout and size) and its late result is
      // dropped.
      const answer = valueOf<MotifWebsiteSuggestion>(ctx.remote.motif.analyzeWebsite({ url }))
      return await new Promise<MotifWebsiteSuggestion>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'))
          return
        }
        const onAbort = (): void => { reject(new DOMException('Aborted', 'AbortError')) }
        signal.addEventListener('abort', onAbort, { once: true })
        answer.then(resolve, reject).finally(() => { signal.removeEventListener('abort', onAbort) })
      })
    },
    openBrand: (workspaceId) => {
      void ctx.uiWorkspace.openWorkspace(workspaceId as WorkspaceId).catch((reason: unknown) => {
        ctx.logger.error(reason)
      })
    },
    loadTimeline: brand => valueOf<readonly MotifTimelineEntry[]>(ctx.remote.motif.timeline({ brandId: brand.id })),
    sendEditRequest: async (brand: MotifBrand, text: string, signal: AbortSignal) => {
      if (brand.workspaceId === undefined) {
        return { ok: false, message: 'The Brand has no Workspace yet.' }
      }
      const workspaceId = brand.workspaceId as WorkspaceId
      try {
        const workspace = ctx.workspaces.list.getSnapshot().items
          .find(item => item.workspaceId === workspaceId)
        const sessionId = workspace?.sessionIds[0] ?? await ctx.sessions.create({ workspaceId })
        await ctx.sessions.using(sessionId, { source: 'motifEditRequest', signal }, async (reference) => {
          await reference.ready
          const scoped = reference.binding.ctx
          const cancel = (): void => {
            void scoped.conversation.cancel().catch((reason: unknown) => { ctx.logger.error(reason) })
          }
          if (signal.aborted) {
            cancel()
            return
          }
          signal.addEventListener('abort', cancel, { once: true })
          try {
            await scoped.conversation.send(text)
          } finally {
            signal.removeEventListener('abort', cancel)
          }
        })
        return { ok: true, message: '' }
      } catch (reason: unknown) {
        return { ok: false, message: reason instanceof Error ? reason.message : String(reason) }
      }
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'motif-mode', order: 0,
    label: () => 'Developer Mode',
    inject: () => ({ preference: ctx.configForms.developerTools }),
  }, DeveloperModeSection))

  // The blank-session home is the Brands page, not the generic chat hero.
  ctx.slots.inject('conversation.hero.frame', () => ctx.slots.register({
    name: 'conversation.hero.frame',
    id: 'motif-home',
    inject: face,
  }, MotifHomeFrame))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'motif-brands',
    order: 1,
    label: () => t('brands.nav'),
    inject: face,
  }, BrandsSection))

  // First-run check. The step is completed by either button, so a dismissed
  // welcome never blocks the shell; the AI page keeps every retry.
  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'motif-ai',
    order: 0,
    inject: face,
  }, MotifOnboarding))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'motif-ai',
    order: 2,
    label: () => t('ai.nav'),
    inject: face,
  }, AiSection))
}
