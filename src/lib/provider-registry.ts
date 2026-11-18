// The one registry MOTIF uses for provider identity, permitted auth methods, validation and docs.
// This module is safe for browser and server. It contains no credentials, no environment access,
// and no provider SDK imports. Adding a provider means adding a descriptor here plus a server
// adapter; the UI, status, disconnect and model selection code do not change.

export type ProviderId =
  | "openai"
  | "openai-codex"
  | "anthropic"
  | "openrouter"
  | "xai"
  | "google"
  | "github-copilot"
  | "opencode"
  | "opencode-go";

/** A method the user can actually use, never a speculative sign-in button. */
export type AuthMethodId = "api_key" | "openrouter_pkce" | "github_oauth";
export type AuthMethodKind = "api_key" | "oauth";
export type ConnectionMethod = AuthMethodId;
/** Legacy name used by the rest of the app. */
export type LinkMethod = ConnectionMethod;

export type KeyProblem = "shape" | "rejected" | "limited" | "unreachable" | "failed";

export type LinkModel = {
  id: string;
  name: string;
  /** What the model accepts as input. Absent when the provider did not say. */
  input?: ("text" | "image")[];
  /** True when the provider charges nothing for this model. */
  free?: boolean;
};

export function acceptsImages(model: LinkModel | undefined): boolean {
  return model?.input?.includes("image") ?? false;
}

export function modelNote(model: LinkModel): string | null {
  const vision = acceptsImages(model) ? "images" : "text only";
  return model.free ? `Free · ${vision}` : vision === "text only" ? "Text only" : null;
}

/** Provider-specific, side-effect-free credential validation. No key is stored by this call. */
export type ValidationSpec = {
  /** The endpoint that proves the key works. */
  checkUrl: string;
  /** A separate public model catalogue, used by OpenRouter after its key check. */
  modelsUrl?: string;
  header: "bearer" | "anthropic" | "google";
  /** Provider-specific extra headers that contain no secret. */
  extraHeaders?: Record<string, string>;
};

export type AuthMethodDescriptor = {
  id: AuthMethodId;
  label: string;
  kind: AuthMethodKind;
  docsUrl: string;
  note?: string;
  /** Only API keys carry validation specs. */
  validation?: ValidationSpec;
  /** Environment needed before this method can ever be offered. */
  requiresConfig?: readonly string[];
  /** False for researched but deliberately unexposed methods. */
  implemented: boolean;
};

export type ProviderDescriptor = {
  id: ProviderId;
  name: string;
  /** The provider id in the installed Pi 1.5.2 model runtime. */
  runtimeProviderId: string;
  defaultModel: string;
  methods: readonly AuthMethodDescriptor[];
  docs: readonly string[];
  /** Shown in the UI when a restriction or absence would otherwise be confusing. */
  note?: string;
  /** A documented provider that is intentionally not offered as a connection. */
  hidden?: boolean;
};

const API_KEY_SHAPE =
  "Paste a key from the provider's console. MOTIF validates it server-side, then encrypts it; the browser never sees the stored value again.";

/**
 * Only officially supported BYOAI methods are marked implemented. Pi SDK flows that reuse a
 * first-party CLI OAuth client, Claude.ai subscription credentials, or OpenCode's global server
 * state are deliberately not offered here.
 */
export const PROVIDERS: readonly ProviderDescriptor[] = [
  {
    id: "openai",
    name: "OpenAI",
    runtimeProviderId: "openai",
    defaultModel: "gpt-6.1-sol",
    methods: [
      {
        id: "api_key",
        label: "Use an OpenAI API key",
        kind: "api_key",
        implemented: true,
        docsUrl: "https://developers.openai.com/api/reference/overview",
        note: API_KEY_SHAPE,
        validation: { checkUrl: "https://api.openai.com/v1/models", header: "bearer" },
      },
    ],
    docs: [
      "https://developers.openai.com/api/reference/overview",
      "https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations",
    ],
    note: "A ChatGPT Plus/Pro plan is not an OpenAI API key. MOTIF uses official API-key billing and does not reuse the Codex CLI OAuth client.",
  },
  {
    id: "openai-codex",
    name: "ChatGPT / Codex",
    runtimeProviderId: "openai-codex",
    defaultModel: "gpt-6.1-sol",
    hidden: true,
    methods: [],
    docs: ["https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations"],
    note: "Pi's device-code flow uses the official Codex CLI client. MOTIF does not expose it until OpenAI eligibility and a MOTIF-owned client are established.",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    runtimeProviderId: "anthropic",
    defaultModel: "claude-sonnet-4-6",
    methods: [
      {
        id: "api_key",
        label: "Use an Anthropic API key",
        kind: "api_key",
        implemented: true,
        docsUrl: "https://docs.anthropic.com/en/docs/claude-code/sdk",
        note: API_KEY_SHAPE,
        validation: {
          checkUrl: "https://api.anthropic.com/v1/models?limit=100",
          header: "anthropic",
          extraHeaders: { "anthropic-version": "2023-06-01" },
        },
      },
    ],
    docs: ["https://code.claude.com/docs/en/legal-and-compliance"],
    note: "Claude Pro/Max plans cannot sign in to arbitrary third-party apps. Anthropic requires third-party developers to use API keys or approved cloud credentials.",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    runtimeProviderId: "openrouter",
    defaultModel: "openrouter/auto",
    methods: [
      {
        id: "api_key",
        label: "Use an OpenRouter API key",
        kind: "api_key",
        implemented: true,
        docsUrl: "https://openrouter.ai/docs/api_reference/authentication",
        note: API_KEY_SHAPE,
        validation: {
          checkUrl: "https://openrouter.ai/api/v1/key",
          modelsUrl: "https://openrouter.ai/api/v1/models",
          header: "bearer",
        },
      },
      {
        id: "openrouter_pkce",
        label: "Connect with OpenRouter",
        kind: "oauth",
        implemented: true,
        docsUrl: "https://openrouter.ai/docs/guides/overview/auth/oauth",
        note: "OpenRouter's official BYOAI PKCE flow mints a user-controlled API key. MOTIF validates state, S256 PKCE, the callback and the minted key server-side.",
      },
    ],
    docs: [
      "https://openrouter.ai/docs/guides/overview/auth/oauth",
      "https://openrouter.ai/docs/api_reference/authentication",
    ],
    note: "Free models have provider-published request limits; paid usage follows the user's OpenRouter account and credit limits.",
  },
  {
    id: "xai",
    name: "xAI Grok",
    runtimeProviderId: "xai",
    defaultModel: "grok-4.7",
    methods: [
      {
        id: "api_key",
        label: "Use an xAI API key",
        kind: "api_key",
        implemented: true,
        docsUrl: "https://docs.x.ai/docs/api-reference#api-key",
        note: API_KEY_SHAPE,
        validation: {
          checkUrl: "https://api.x.ai/v1/language-models",
          header: "bearer",
        },
      },
    ],
    docs: ["https://docs.x.ai/docs/api-reference#api-key", "https://docs.x.ai/build/enterprise"],
    note: "SuperGrok / X Premium device-code sign-in is documented for Grok Build and the xAI CLI, not as a public third-party MOTIF OAuth API. Use an xAI API key.",
  },
  {
    id: "google",
    name: "Google Gemini",
    runtimeProviderId: "google",
    defaultModel: "gemini-3.8-flash",
    methods: [
      {
        id: "api_key",
        label: "Use a Gemini API key",
        kind: "api_key",
        implemented: true,
        docsUrl: "https://ai.google.dev/gemini-api/docs/api-key",
        note: API_KEY_SHAPE,
        validation: {
          checkUrl: "https://generativelanguage.googleapis.com/v1beta/models",
          header: "google",
        },
      },
    ],
    docs: [
      "https://ai.google.dev/gemini-api/docs/api-key",
      "https://ai.google.dev/gemini-api/docs/oauth",
    ],
    note: "Google's OAuth quickstart is Google Cloud ADC for testing, not consumer Gemini sign-in for arbitrary hosted apps. Use a Gemini API key.",
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    runtimeProviderId: "github-copilot",
    defaultModel: "claude-sonnet-4.6",
    methods: [
      {
        id: "github_oauth",
        label: "Connect GitHub Copilot",
        kind: "oauth",
        implemented: false,
        requiresConfig: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "MOTIF_PUBLIC_BASE_URL"],
        docsUrl: "https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/github-oauth",
        note: "Requires a MOTIF-owned GitHub OAuth App / GitHub App, per-user token isolation and a Copilot subscription. MOTIF does not expose Pi's first-party Copilot device flow.",
      },
    ],
    docs: [
      "https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/github-oauth",
      "https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/auth/authenticate",
    ],
    note: "MOTIF does not expose Pi's first-party Copilot device flow. A MOTIF-owned GitHub OAuth App / GitHub App is required.",
  },
  {
    id: "opencode",
    name: "OpenCode Zen",
    runtimeProviderId: "opencode",
    defaultModel: "kimi-k2.7-code",
    methods: [
      {
        id: "api_key",
        label: "Use an OpenCode Zen API key",
        kind: "api_key",
        implemented: true,
        docsUrl: "https://opencode.ai/docs/providers/",
        note: API_KEY_SHAPE,
        validation: {
          checkUrl: "https://opencode.ai/inference/v1/models",
          header: "bearer",
        },
      },
    ],
    docs: ["https://opencode.ai/docs/providers/", "https://opencode.ai/docs/sdk/"],
    note: "OpenCode's CLI/server auth is saved to a global SQLite database and is not a portable per-user web credential store. MOTIF uses its published API-key gateways only.",
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    runtimeProviderId: "opencode-go",
    defaultModel: "kimi-k3.1-pro",
    methods: [
      {
        id: "api_key",
        label: "Use an OpenCode Go API key",
        kind: "api_key",
        implemented: true,
        docsUrl: "https://opencode.ai/docs/providers/",
        note: API_KEY_SHAPE,
        validation: {
          checkUrl: "https://opencode.ai/inference/go/v1/models",
          header: "bearer",
        },
      },
    ],
    docs: ["https://opencode.ai/docs/providers/", "https://opencode.ai/docs/sdk/"],
  },
] as const;

export type ProviderDescriptorEntry = (typeof PROVIDERS)[number];

const BY_ID = new Map<string, ProviderDescriptor>(
  PROVIDERS.map((provider) => [provider.id, provider]),
);

export function providerById(id: string): ProviderDescriptor | undefined {
  return BY_ID.get(id);
}

export function isProviderId(id: string): id is ProviderId {
  return BY_ID.has(id);
}

export function authMethod(providerId: string, methodId: string): AuthMethodDescriptor | undefined {
  return providerById(providerId)?.methods.find((method) => method.id === methodId);
}

export function apiKeyValidation(providerId: string): ValidationSpec | undefined {
  return providerById(providerId)?.methods.find((method) => method.id === "api_key")?.validation;
}

export type ProviderCapabilities = {
  /** Environment variable names that are present server-side. */
  configuredEnv: readonly string[];
};

export type AuthMethodView = {
  id: AuthMethodId;
  label: string;
  kind: AuthMethodKind;
  available: boolean;
  note: string;
  docsUrl: string;
};

export type ProviderView = {
  id: ProviderId;
  name: string;
  defaultModel: string;
  note?: string;
  docs: readonly string[];
  methods: readonly AuthMethodView[];
};

/** The browser receives capabilities, not environment variables or secrets. */
export function providerViews(capabilities: ProviderCapabilities): ProviderView[] {
  const configured = new Set(capabilities.configuredEnv);
  return PROVIDERS.filter((provider) => !provider.hidden).map((provider) => ({
    id: provider.id,
    name: provider.name,
    defaultModel: provider.defaultModel,
    ...(provider.note ? { note: provider.note } : {}),
    docs: provider.docs,
    methods: provider.methods.map((method) => {
      const missing = (method.requiresConfig ?? []).filter((name) => !configured.has(name));
      const unavailableReason = !method.implemented
        ? "This integration is researched but not enabled in this deployment."
        : missing.length > 0
          ? `Server configuration required: ${missing.join(", ")}.`
          : undefined;
      return {
        id: method.id,
        label: method.label,
        kind: method.kind,
        available: method.implemented && missing.length === 0,
        note: unavailableReason ?? method.note ?? "",
        docsUrl: method.docsUrl,
      };
    }),
  }));
}

export function availableApiKeyProviderIds(): ProviderId[] {
  return PROVIDERS.flatMap((provider) =>
    !provider.hidden &&
    provider.methods.some((method) => method.id === "api_key" && method.implemented)
      ? [provider.id]
      : [],
  );
}

export type ConnectionStatus = "connected" | "needs_reconnect";

export type LinkedAccount = {
  providerId: ProviderId;
  method: ConnectionMethod;
  status: ConnectionStatus;
  /** The model the AI features use. */
  model: string;
  /** Models available to this validated credential. */
  models: LinkModel[];
  connectedAt: number;
  updatedAt: number;
  /** A safe, provider-specific reason for a reconnect state. */
  note?: string;
};

export type PendingOAuth = {
  providerId: ProviderId;
  method: AuthMethodId;
  message: string;
  startedAt: number;
};

export type LinkStatus = {
  /** All validated connections belonging to this browser principal. */
  accounts: LinkedAccount[];
  /** The active connection, or null. Kept for the app's existing callers. */
  account: LinkedAccount | null;
  activeProviderId: ProviderId | null;
  providers: ProviderView[];
  pendingOAuth: PendingOAuth | null;
};

export type LinkResult = {
  status: LinkStatus;
  error: string | null;
  note?: string;
  /** An official provider authorization URL. Never contains the PKCE verifier or a credential. */
  authorizationUrl?: string;
};

export type KeyCheck =
  | {
      ok: true;
      models: LinkModel[];
      /** Safe provider detail, such as a free-tier allowance. */
      detail?: string;
    }
  | { ok: false; problem: KeyProblem; detail?: string };

/** Why an AI request could not be answered. */
export type AiFailure = "not_linked" | "no_vision" | "rejected" | "limited" | "failed";

export const KEY_WORDING: Record<KeyProblem, (name: string) => string> = {
  shape: () => "That doesn't look like an API key. Paste it exactly as your provider shows it.",
  rejected: (name) => `${name} didn't accept that key. Check it and paste it again.`,
  limited: (name) =>
    `${name} accepted the account but is rate limited or out of credit. Try again later.`,
  unreachable: (name) =>
    `MOTIF's server couldn't reach ${name} to check the key. Try again in a moment.`,
  failed: () => "MOTIF couldn't check that key just now. Try again in a moment.",
};
