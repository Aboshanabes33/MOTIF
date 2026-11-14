import { ExternalLink, KeyRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  API_KEY_PROVIDERS,
  NO_SIGN_IN,
  SIGN_IN_PROVIDERS,
  keyProvider,
  linkProvider,
  modelNote,
  type LinkProviderId,
  type LinkResult,
  type LinkStatus,
  type LinkedAccount,
  type SignInView,
} from "@/lib/account-link";
import {
  answerSignIn,
  cancelSignIn,
  chooseModel,
  getLinkStatus,
  linkApiKey,
  startSignIn,
  unlinkAccount,
} from "@/lib/account-link.functions";
import { readLinkToken, writeLinkToken } from "@/lib/link-token";
import { AccountLinkContext, useAccountLink } from "@/lib/useAccountLink";

/** How often a running sign-in is checked. It finishes on the provider's side, not here. */
const POLL_MS = 2000;

const FIELD =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm [color-scheme:dark] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";
const FIELD_LABEL = "grid gap-1.5 text-xs text-muted-foreground";

/** A ref that moves the keyboard focus to each view's main control when the view appears. */
const focusOnMount = (element: HTMLElement | null) => element?.focus();

/**
 * Asks the visitor to link an AI account when the app opens without one, and keeps the pop-up
 * available afterwards through `useAccountLink().openLink`.
 */
export function AccountLinkProvider({ children }: { children: ReactNode }) {
  // Null until the server has said what this browser has linked.
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Counts finished actions: a status check that began before one finished is out of date.
  const actions = useRef(0);

  const apply = useCallback((next: LinkStatus) => {
    writeLinkToken(next.token);
    setStatus(next);
  }, []);

  /** Asks the server for the current status. Null when the server did not answer. */
  const refresh = useCallback(async (): Promise<LinkStatus | null> => {
    const token = readLinkToken();
    if (token === null) {
      const nothing: LinkStatus = { token: null, account: null, signIn: null };
      apply(nothing);
      return nothing;
    }
    const before = actions.current;
    try {
      const next = await getLinkStatus({ data: { token } });
      if (actions.current === before) apply(next);
      return next;
    } catch {
      return null;
    }
  }, [apply]);

  const act = useCallback(
    async (action: (token: string | null) => Promise<LinkResult | LinkStatus>) => {
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        const result = await action(readLinkToken());
        apply("status" in result ? result.status : result);
        setError("status" in result ? result.error : null);
        setNote("status" in result ? (result.note ?? null) : null);
      } catch {
        setError("Motif's server didn't answer. Try again.");
      } finally {
        actions.current += 1;
        setBusy(false);
      }
    },
    [apply],
  );

  // When the app opens: find out what this browser has linked, and ask when it is nothing.
  useEffect(() => {
    let left = false;
    void refresh().then((next) => {
      if (left) return;
      // No answer: keep the token, the link may still be there, but offer to link.
      if (next === null) setStatus({ token: readLinkToken(), account: null, signIn: null });
      if (!next?.account) setOpen(true);
    });
    return () => {
      left = true;
    };
  }, [refresh]);

  const signingIn = Boolean(status?.signIn && !status.signIn.error);
  useEffect(() => {
    if (!signingIn) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [signingIn, refresh]);

  const openLink = useCallback(() => {
    setError(null);
    setOpen(true);
    void refresh();
  }, [refresh]);

  const close = () => {
    // Closing the pop-up gives up a sign-in that is under way, and dismisses one that failed.
    if (status?.signIn) void act((token) => cancelSignIn({ data: { token } }));
    setError(null);
    setOpen(false);
  };

  const account = status?.account ?? null;
  const signIn = status?.signIn ?? null;
  const description = signIn
    ? `Finish signing in to ${linkProvider(signIn.providerId).name} to link your account.`
    : account
      ? "Motif's AI edits run on this account."
      : "Motif's AI edits run on your own AI account. Sign in to a subscription, or paste an API key.";
  const value = useMemo(
    () => ({ account, ready: status !== null, openLink }),
    [account, status, openLink],
  );

  return (
    <AccountLinkContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent
          className="focus:outline-none"
          // A stray click outside must not cancel a sign-in the visitor is finishing in another tab.
          onInteractOutside={(event) => {
            if (signingIn) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {account && !signIn ? "Your AI account" : "Link your AI account"}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {status === null ? (
            <p className="text-sm text-muted-foreground">Checking your account…</p>
          ) : status.signIn ? (
            <SignIn
              view={status.signIn}
              busy={busy}
              onAnswer={(promptId, answer) =>
                act((token) => answerSignIn({ data: { token, promptId, value: answer } }))
              }
              onCancel={() => act((token) => cancelSignIn({ data: { token } }))}
              onRetry={(providerId) => act((token) => startSignIn({ data: { token, providerId } }))}
            />
          ) : status.account ? (
            <Linked
              account={status.account}
              busy={busy}
              onModel={(model) => act((token) => chooseModel({ data: { token, model } }))}
              onUnlink={() => act((token) => unlinkAccount({ data: { token } }))}
              onDone={close}
            />
          ) : (
            <Choose
              busy={busy}
              onSignIn={(providerId) =>
                act((token) => startSignIn({ data: { token, providerId } }))
              }
              onApiKey={(providerId, apiKey) =>
                act((token) => linkApiKey({ data: { token, providerId, apiKey } }))
              }
              onSkip={close}
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {!error && note && (
            <p role="status" className="text-sm text-muted-foreground">
              {note}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </AccountLinkContext.Provider>
  );
}

function Choose(props: {
  busy: boolean;
  onSignIn: (providerId: LinkProviderId) => void;
  onApiKey: (providerId: LinkProviderId, apiKey: string) => void;
  onSkip: () => void;
}) {
  // Start the key form on the first provider that takes a key; the list never shows an
  // account-only provider, which would offer a field it cannot accept.
  const [providerId, setProviderId] = useState<LinkProviderId>(API_KEY_PROVIDERS[0]!.id);
  const [apiKey, setApiKey] = useState("");
  const chosenProvider = keyProvider(providerId);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    props.onApiKey(providerId, apiKey);
  };
  return (
    <div className="grid gap-5">
      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">Connect your subscription</h3>
        {SIGN_IN_PROVIDERS.map((provider, index) => (
          <Button
            key={provider.id}
            ref={index === 0 ? focusOnMount : undefined}
            variant="outline"
            disabled={props.busy}
            onClick={() => props.onSignIn(provider.id)}
          >
            {provider.signIn}
          </Button>
        ))}
        <p className="text-xs text-muted-foreground">
          You approve once on the provider&apos;s own page. Motif does the rest.
        </p>
        {NO_SIGN_IN.map((provider) => (
          <p key={provider.id} className="text-xs text-muted-foreground">
            {provider.noSignInNote}
          </p>
        ))}
      </section>
      <form className="grid gap-3" onSubmit={submit}>
        <h3 className="text-sm font-semibold">Use an API key</h3>
        <label className={FIELD_LABEL}>
          Provider
          <select
            className={FIELD}
            value={providerId}
            disabled={props.busy}
            onChange={(event) => {
              const chosen = keyProvider(event.target.value);
              if (chosen) setProviderId(chosen.id);
            }}
          >
            {API_KEY_PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <label className={FIELD_LABEL}>
          API key
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-…"
            value={apiKey}
            disabled={props.busy}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
        {chosenProvider?.keyNote && (
          <p className="text-xs text-muted-foreground">{chosenProvider.keyNote}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Motif checks the key with {chosenProvider?.name ?? "the provider"} before linking, then
          keeps it in memory until you unlink or the server restarts. It never reaches your browser.
        </p>
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="ghost" onClick={props.onSkip}>
            Not now
          </Button>
          <Button type="submit" disabled={props.busy || apiKey.trim() === ""}>
            Link account
          </Button>
        </DialogFooter>
      </form>
    </div>
  );
}

function SignIn(props: {
  view: SignInView;
  busy: boolean;
  onAnswer: (promptId: string, answer: string) => void;
  onCancel: () => void;
  onRetry: (providerId: LinkProviderId) => void;
}) {
  const { view, busy } = props;
  const prompt = view.prompt;
  const provider = linkProvider(view.providerId);
  const [answer, setAnswer] = useState("");
  const promptId = prompt?.id;
  useEffect(() => setAnswer(""), [promptId]);

  if (view.error) {
    return (
      <div className="grid gap-4">
        <p className="text-sm">The {provider.name} sign-in didn&apos;t finish.</p>
        <p role="alert" className="text-sm text-destructive">
          {view.error}
        </p>
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button variant="ghost" disabled={busy} onClick={props.onCancel}>
            Back
          </Button>
          <Button ref={focusOnMount} disabled={busy} onClick={() => props.onRetry(view.providerId)}>
            Try again
          </Button>
        </DialogFooter>
      </div>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (prompt) props.onAnswer(prompt.id, answer.trim());
  };
  // A device-code sign-in shows one code and one link; a browser one shows a link only. Both are
  // described by what the user does there, never by what OAuth is doing underneath.
  const link = view.code?.url ?? view.url;
  return (
    <div className="grid gap-4">
      {view.code && (
        <div className="grid gap-2 rounded-lg border border-input p-3">
          <p className="text-xs text-muted-foreground">Enter this code on {provider.name}</p>
          <code className="select-all font-mono text-lg tracking-[0.2em] text-foreground">
            {view.code.value}
          </code>
        </div>
      )}
      {link && (
        <Button asChild>
          <a ref={focusOnMount} href={link} target="_blank" rel="noopener noreferrer">
            {view.code ? "Open the approval page" : `Open the ${provider.name} sign-in page`}{" "}
            <ExternalLink />
          </a>
        </Button>
      )}
      {link ? (
        <p className="text-sm text-muted-foreground">
          Approve the request there and this window carries on by itself.
        </p>
      ) : (
        !prompt && <p className="text-sm text-muted-foreground">Starting the sign-in…</p>
      )}
      {prompt?.kind === "select" && (
        <div className="grid gap-2">
          <p className="text-sm">{prompt.message}</p>
          {prompt.options?.map((option) => (
            <Button
              key={option.id}
              variant="outline"
              disabled={busy}
              onClick={() => props.onAnswer(prompt.id, option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
      {prompt && prompt.kind !== "select" && (
        <form className="grid gap-2" onSubmit={submit}>
          <label className={FIELD_LABEL}>
            {prompt.message}
            <Input
              type={prompt.kind === "secret" ? "password" : "text"}
              autoComplete="off"
              spellCheck={false}
              placeholder={prompt.placeholder}
              value={answer}
              disabled={busy}
              onChange={(event) => setAnswer(event.target.value)}
            />
          </label>
          <Button type="submit" variant="outline" disabled={busy || answer.trim() === ""}>
            Continue
          </Button>
        </form>
      )}
      {view.message && <p className="text-xs text-muted-foreground">{view.message}</p>}
      <DialogFooter>
        <Button variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
      </DialogFooter>
    </div>
  );
}

function Linked(props: {
  account: LinkedAccount;
  busy: boolean;
  onModel: (model: string) => void;
  onUnlink: () => void;
  onDone: () => void;
}) {
  const { account, busy } = props;
  const provider = linkProvider(account.providerId);
  return (
    <div className="grid gap-4">
      <p className="text-sm">
        Linked to <strong>{provider.name}</strong>{" "}
        {account.method === "sign_in" ? "with your subscription sign-in" : "with an API key"}.
      </p>
      <label className={FIELD_LABEL}>
        Model
        <select
          className={FIELD}
          value={account.model}
          disabled={busy}
          onChange={(event) => props.onModel(event.target.value)}
        >
          {account.models.map((model) => {
            const note = modelNote(model);
            return (
              <option key={model.id} value={model.id}>
                {note ? `${model.name} — ${note}` : model.name}
              </option>
            );
          })}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">
        Unlinking makes Motif forget this account. It does not cancel the key or the sign-in at{" "}
        {provider.name}.
      </p>
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button variant="outline" disabled={busy} onClick={props.onUnlink}>
          Unlink
        </Button>
        <Button ref={focusOnMount} onClick={props.onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}

/** The sidebar entry that shows the linked account and reopens the pop-up. */
export function AccountLinkButton() {
  const { account, ready, openLink } = useAccountLink();
  const detail = !ready
    ? "…"
    : account
      ? `${linkProvider(account.providerId).name} · ${account.model}`
      : "Not linked";
  return (
    <button
      onClick={openLink}
      className="mt-auto flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent"
    >
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary">
        <KeyRound className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block">AI account</span>
        <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}
