// Account linking on the server: one link per browser, held in this process's memory.
//
// A link is the credential a visitor gave Motif (an API key, or a provider sign-in) and the model
// they chose. The browser holds only a random token that names its link, so the credential never
// leaves the server and one visitor cannot use another's account. Nothing is written to disk: a
// restart forgets every link.

import { randomBytes } from "node:crypto";

import {
  linkProvider,
  type AiFailure,
  type LinkMethod,
  type LinkProviderId,
  type LinkResult,
  type LinkStatus,
  type SignInPrompt,
  type SignInView,
} from "./account-link";

/** A question from a provider's sign-in. `signal` fires when the answer is no longer needed. */
export type SignInQuestion = Omit<SignInPrompt, "id"> & { signal?: AbortSignal };

export type SignInEvent =
  | { kind: "url"; url: string }
  | { kind: "code"; value: string; url: string }
  | { kind: "message"; message: string };

export interface SignInInteraction {
  /** Fires when the sign-in is cancelled or has taken too long. */
  signal: AbortSignal;
  ask(question: SignInQuestion): Promise<string>;
  notify(event: SignInEvent): void;
}

export type Completion =
  { ok: true; text: string } | { ok: false; reason: AiFailure; status: number | null };

/**
 * What Motif needs from an AI provider library, for one visitor. The Pi SDK implements it in
 * pi.server.ts; nothing else in Motif knows which library is behind it.
 */
export interface ProviderRuntime {
  /** Stores an API key for the provider, replacing its earlier credential. */
  linkApiKey(providerId: string, apiKey: string): Promise<void>;
  /** Runs the provider's sign-in to the end. Rejects when it fails or `signal` fires. */
  signIn(providerId: string, interaction: SignInInteraction): Promise<void>;
  unlink(providerId: string): Promise<void>;
  /** The providers that hold a credential. */
  linked(): Promise<{ providerId: string; method: LinkMethod }[]>;
  /** The models the provider's credential can use. */
  models(providerId: string): Promise<{ id: string; name: string }[]>;
  /** Sends one prompt and returns the reply text. Fails without a credential for the provider. */
  complete(providerId: string, modelId: string, prompt: string): Promise<Completion>;
}

export type AccountLinksOptions = {
  createRuntime: () => Promise<ProviderRuntime>;
  now?: () => number;
  /** Links kept at once. Past it the least recently used link is dropped. */
  maxLinks?: number;
  /** A link unused for this long is dropped. */
  idleMs?: number;
  /** A sign-in still running after this long is cancelled. */
  signInTimeoutMs?: number;
  /** A sign-in whose browser has been silent this long gives way to another visitor's. */
  signInStaleMs?: number;
  /** How long an action waits for the sign-in to react before it answers the browser. */
  settleMs?: number;
};

type Attempt = {
  view: SignInView;
  controller: AbortController;
  /** Answers the question in `view.prompt`. */
  answer: ((value: string) => void) | null;
  /** When the browser last asked about this sign-in. */
  seenAt: number;
  /** Settles once the provider's sign-in has returned and released what it held. Never rejects. */
  done: Promise<void>;
  /** Calls waiting for the view to change. */
  waiters: Set<() => void>;
};

type Link = {
  token: string;
  runtime: ProviderRuntime;
  account: { providerId: LinkProviderId; method: LinkMethod; model: string } | null;
  attempt: Attempt | null;
  usedAt: number;
};

const NOTHING: LinkStatus = { token: null, account: null, signIn: null };

// Letters, digits and the punctuation real keys use. Refusing everything else also keeps a typed
// value from being read as something other than a key: the Pi SDK's file store runs a stored key
// that starts with "!" as a shell command and expands "$NAME" from the server's environment.
const API_KEY = /^[A-Za-z0-9][\w.~+/=:-]{7,511}$/;

const BUSY = "Someone else is signing in on this server right now. Try again in a minute.";

function clip(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isWebUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function wake(attempt: Attempt): void {
  const waiters = [...attempt.waiters];
  attempt.waiters.clear();
  for (const resume of waiters) resume();
}

export class AccountLinks {
  private readonly links = new Map<string, Link>();
  /** The link whose sign-in is running. Provider sign-ins share one callback port: one at a time. */
  private signingIn: Link | null = null;
  private sweptAt = 0;
  private readonly createRuntime: () => Promise<ProviderRuntime>;
  private readonly now: () => number;
  private readonly maxLinks: number;
  private readonly idleMs: number;
  private readonly signInTimeoutMs: number;
  private readonly signInStaleMs: number;
  private readonly settleMs: number;

  constructor(options: AccountLinksOptions) {
    this.createRuntime = options.createRuntime;
    this.now = options.now ?? Date.now;
    this.maxLinks = options.maxLinks ?? 500;
    this.idleMs = options.idleMs ?? 24 * 60 * 60 * 1000;
    this.signInTimeoutMs = options.signInTimeoutMs ?? 10 * 60 * 1000;
    this.signInStaleMs = options.signInStaleMs ?? 90 * 1000;
    this.settleMs = options.settleMs ?? 3000;
  }

  /** What the browser holding `token` has linked. An unknown token is simply not linked. */
  async status(token: unknown): Promise<LinkStatus> {
    const link = this.find(token);
    if (!link) return NOTHING;
    if (link.attempt) link.attempt.seenAt = this.now();
    return this.view(link);
  }

  async linkApiKey(
    token: unknown,
    providerId: LinkProviderId,
    apiKey: string,
  ): Promise<LinkResult> {
    const key = apiKey.trim();
    if (!API_KEY.test(key)) {
      const error =
        "That doesn't look like an API key. Paste it exactly as your provider shows it.";
      return { status: await this.status(token), error };
    }
    const link = this.find(token) ?? (await this.create());
    await this.endSignIn(link);
    try {
      await link.runtime.linkApiKey(providerId, key);
      await this.activate(link, providerId, "api_key");
    } catch (error) {
      console.error("Storing an API key failed:", String(error).replaceAll(key, "[key]"));
      // Leave no credential behind that the link does not use.
      if (link.account?.providerId !== providerId) {
        await link.runtime.unlink(providerId).catch(() => {});
      }
      this.discardIfEmpty(link);
      return {
        status: await this.statusOf(link),
        error: "Motif couldn't store that key. Try again.",
      };
    }
    return { status: await this.view(link), error: null };
  }

  /** Starts the provider's own sign-in. The browser then follows it through `status()`. */
  async startSignIn(token: unknown, providerId: LinkProviderId): Promise<LinkResult> {
    const provider = linkProvider(providerId);
    if (provider.signIn === undefined) {
      const error = `${provider.name} has no sign-in. Link it with an API key.`;
      return { status: await this.status(token), error };
    }
    const link = this.find(token) ?? (await this.create());
    await this.endSignIn(link);
    const holder = this.signingIn;
    const quietFor = holder?.attempt ? this.now() - holder.attempt.seenAt : Infinity;
    if (holder && (holder === link || quietFor > this.signInStaleMs)) {
      // Another visitor's browser stopped asking about its sign-in: the tab was closed, or it
      // lost its token. (This link's own sign-in has just been ended above.)
      await this.endSignIn(holder);
      this.discardIfEmpty(holder);
      if (this.signingIn === holder) this.signingIn = null;
    }
    if (this.signingIn) {
      this.discardIfEmpty(link);
      return { status: await this.statusOf(link), error: BUSY };
    }
    this.signingIn = link;
    const attempt = this.begin(link, providerId);
    link.attempt = attempt;
    const view = attempt.view;
    await this.settle(link, attempt, () => Boolean(view.url ?? view.code ?? view.prompt));
    return { status: await this.statusOf(link), error: null };
  }

  /** Answers the question a running sign-in is waiting on. */
  async answerSignIn(token: unknown, promptId: string, value: string): Promise<LinkResult> {
    const link = this.find(token);
    const attempt = link?.attempt;
    if (!link || !attempt?.answer || attempt.view.prompt?.id !== promptId) {
      const error = "That sign-in is no longer waiting for an answer.";
      return { status: await this.status(token), error };
    }
    attempt.seenAt = this.now();
    attempt.answer(value);
    await this.settle(link, attempt, () => Boolean(attempt.view.prompt));
    return { status: await this.statusOf(link), error: null };
  }

  /** Cancels a running sign-in, or dismisses a failed one. */
  async cancelSignIn(token: unknown): Promise<LinkStatus> {
    const link = this.find(token);
    if (!link) return NOTHING;
    await this.endSignIn(link);
    this.discardIfEmpty(link);
    return this.statusOf(link);
  }

  async chooseModel(token: unknown, model: string): Promise<LinkResult> {
    const link = this.find(token);
    if (!link?.account)
      return { status: await this.status(token), error: "Link an account first." };
    const models = await link.runtime.models(link.account.providerId);
    if (!models.some((candidate) => candidate.id === model)) {
      return {
        status: await this.view(link),
        error: "That model isn't available on this account.",
      };
    }
    link.account.model = model;
    return { status: await this.view(link), error: null };
  }

  /** Forgets the link and its credential. It does not revoke anything at the provider. */
  async unlink(token: unknown): Promise<LinkStatus> {
    const link = this.find(token);
    if (!link) return NOTHING;
    await this.endSignIn(link);
    this.links.delete(link.token);
    link.account = null;
    try {
      for (const { providerId } of await link.runtime.linked())
        await link.runtime.unlink(providerId);
    } catch (error) {
      // The link is already unreachable; its credential goes when the runtime is collected.
      console.error("Clearing a credential failed:", error);
    }
    return NOTHING;
  }

  /** Sends one prompt to the model of the linked account. */
  async complete(token: unknown, prompt: string): Promise<Completion> {
    const link = this.find(token);
    if (!link?.account) return { ok: false, reason: "not_linked", status: null };
    return link.runtime.complete(link.account.providerId, link.account.model, prompt);
  }

  private find(token: unknown): Link | undefined {
    this.sweep();
    if (typeof token !== "string") return undefined;
    const link = this.links.get(token);
    if (link) link.usedAt = this.now();
    return link;
  }

  private async create(): Promise<Link> {
    if (this.links.size >= this.maxLinks) {
      let oldest: Link | undefined;
      for (const link of this.links.values()) {
        if (!oldest || link.usedAt < oldest.usedAt) oldest = link;
      }
      if (oldest) this.drop(oldest);
    }
    const link: Link = {
      token: randomBytes(32).toString("base64url"),
      runtime: await this.createRuntime(),
      account: null,
      attempt: null,
      usedAt: this.now(),
    };
    this.links.set(link.token, link);
    return link;
  }

  private sweep(): void {
    const now = this.now();
    if (now - this.sweptAt < 60 * 1000) return;
    this.sweptAt = now;
    for (const link of this.links.values()) {
      if (now - link.usedAt > this.idleMs) this.drop(link);
    }
  }

  private drop(link: Link): void {
    this.links.delete(link.token);
    link.attempt?.controller.abort();
  }

  /** A link with no account and no sign-in holds nothing worth keeping. */
  private discardIfEmpty(link: Link): void {
    if (!link.account && !link.attempt) this.links.delete(link.token);
  }

  private statusOf(link: Link): Promise<LinkStatus> {
    return this.links.has(link.token) ? this.view(link) : Promise.resolve(NOTHING);
  }

  private async view(link: Link): Promise<LinkStatus> {
    const account = link.account && {
      ...link.account,
      models: await link.runtime.models(link.account.providerId),
    };
    const signIn = link.attempt && structuredClone(link.attempt.view);
    return { token: link.token, account, signIn };
  }

  /** Makes `providerId` the link's one account, on the model it had or the provider's default. */
  private async activate(
    link: Link,
    providerId: LinkProviderId,
    method: LinkMethod,
  ): Promise<void> {
    for (const other of await link.runtime.linked()) {
      if (other.providerId !== providerId) await link.runtime.unlink(other.providerId);
    }
    const models = await link.runtime.models(providerId);
    const wanted =
      link.account?.providerId === providerId
        ? link.account.model
        : linkProvider(providerId).defaultModel;
    const model = models.find((candidate) => candidate.id === wanted) ?? models[0];
    if (!model) throw new Error(`No model is available for ${providerId}`);
    link.account = { providerId, method, model: model.id };
  }

  /** Stops the link's sign-in and waits until the provider has let go of it. */
  private async endSignIn(link: Link): Promise<void> {
    const attempt = link.attempt;
    if (!attempt) return;
    attempt.controller.abort();
    await attempt.done;
    if (link.attempt === attempt) link.attempt = null;
  }

  /** Waits until the sign-in is over, `ready()` holds, or `settleMs` has passed. */
  private async settle(link: Link, attempt: Attempt, ready: () => boolean): Promise<void> {
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      wake(attempt);
    }, this.settleMs);
    try {
      while (!expired && link.attempt === attempt && !attempt.view.error && !ready()) {
        await new Promise<void>((resume) => attempt.waiters.add(resume));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private begin(link: Link, providerId: LinkProviderId): Attempt {
    const controller = new AbortController();
    const view: SignInView = { providerId };
    const attempt: Attempt = {
      view,
      controller,
      answer: null,
      seenAt: this.now(),
      done: Promise.resolve(),
      waiters: new Set(),
    };
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.signInTimeoutMs);
    timeout.unref();

    const interaction: SignInInteraction = {
      signal: controller.signal,
      ask: (question) =>
        new Promise<string>((resolve, reject) => {
          const prompt: SignInPrompt = {
            id: randomBytes(9).toString("base64url"),
            kind: question.kind,
            message: clip(question.message),
            ...(question.placeholder ? { placeholder: clip(question.placeholder) } : {}),
            ...(question.options ? { options: question.options } : {}),
          };
          const signals = [controller.signal, question.signal].filter((s) => s !== undefined);
          const close = () => {
            for (const signal of signals) signal.removeEventListener("abort", withdraw);
            if (view.prompt === prompt) {
              delete view.prompt;
              attempt.answer = null;
            }
            wake(attempt);
          };
          const withdraw = () => {
            close();
            reject(new Error("The sign-in no longer needs this answer."));
          };
          if (signals.some((signal) => signal.aborted)) return withdraw();
          for (const signal of signals) signal.addEventListener("abort", withdraw);
          view.prompt = prompt;
          attempt.answer = (value) => {
            close();
            resolve(value);
          };
          wake(attempt);
        }),
      notify: (event) => {
        // A link the page renders: only ever an https address, never javascript: or the like.
        if (event.kind === "url" && isWebUrl(event.url)) view.url = event.url;
        if (event.kind === "code" && isWebUrl(event.url)) {
          view.code = { value: clip(event.value, 64), url: event.url };
        }
        if (event.kind === "message") view.message = clip(event.message);
        wake(attempt);
      },
    };

    attempt.done = (async () => {
      try {
        await link.runtime.signIn(providerId, interaction);
        await this.activate(link, providerId, "sign_in");
        if (link.attempt === attempt) link.attempt = null;
      } catch (error) {
        if (timedOut) {
          view.error = "The sign-in took too long. Start it again.";
        } else if (!controller.signal.aborted) {
          console.error("A provider sign-in failed:", error);
          view.error = clip(error instanceof Error ? error.message : "The sign-in failed.");
        }
        // Leave no credential behind that the link does not use.
        if (link.account?.providerId !== providerId) {
          await link.runtime.unlink(providerId).catch(() => {});
        }
      } finally {
        clearTimeout(timeout);
        delete view.prompt;
        attempt.answer = null;
        if (this.signingIn === link) this.signingIn = null;
        wake(attempt);
      }
    })();
    return attempt;
  }
}

const SHARED = Symbol.for("motif.accountLinks");

/**
 * The links of this server process. Kept on `globalThis` so that a module reload in development
 * does not forget them; restart `npm run dev` after editing this file.
 */
export function accountLinks(): AccountLinks {
  const scope = globalThis as { [SHARED]?: AccountLinks };
  return (scope[SHARED] ??= new AccountLinks({
    createRuntime: async () => (await import("./pi.server")).createPiRuntime(),
  }));
}
