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
import type {} from '@deepseek-ai/dsh-motif-core/remote'
import type { MotifSnapshot } from '@deepseek-ai/dsh-motif-core/types'
import { AiSection, BrandsSection, MotifHomeFrame, MotifOnboarding, type MotifInjected } from './MotifSection.tsx'
import { ar, en, zh, type MotifCopy } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Motif's onboarding and Brand copy. */
    'settings.motif': MotifCopy
  }
}

/** Services the surfaces use. */
export const inject = ['slots', 'locale', 'remote', 'remote.motif', 'uiWorkspace', 'configForms']

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
    install: backend => valueOf(ctx.remote.motif.install({ backend })),
    signIn: backend => valueOf(ctx.remote.motif.signIn({ backend })),
    test: backend => valueOf(ctx.remote.motif.test({ backend })),
    createBrand: request => valueOf(ctx.remote.motif.createBrand(request)),
    openBrand: (workspaceId) => {
      void ctx.uiWorkspace.openWorkspace(workspaceId as WorkspaceId).catch((reason: unknown) => {
        ctx.logger.error(reason)
      })
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
