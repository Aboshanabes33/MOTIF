import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountLinkButton, AccountLinkProvider } from "@/components/AccountLink";
import type { LinkStatus } from "@/lib/account-link";
import * as server from "@/lib/account-link.functions";

vi.mock("@/lib/account-link.functions", () => ({
  getLinkStatus: vi.fn(),
  linkApiKey: vi.fn(),
  startSignIn: vi.fn(),
  answerSignIn: vi.fn(),
  cancelSignIn: vi.fn(),
  chooseModel: vi.fn(),
  unlinkAccount: vi.fn(),
}));

const api = vi.mocked(server);

const TOKEN = "Jw3xT0kenOf43Characters-000000000000000000_";
const KEY = "sk-zen-Qm81TESTKEYq7Lm0000";
const CALLBACK = "http://127.0.0.1:1455/auth/callback";
const AUTHORIZE = "https://auth.openai.com/api/accounts/authorize?client_id=dynamic_agent_client";

const NOTHING: LinkStatus = { token: null, account: null, signIn: null };
const LINKED: LinkStatus = {
  token: TOKEN,
  signIn: null,
  account: {
    providerId: "opencode",
    method: "api_key",
    model: "kimi-k2.7-code",
    models: [
      { id: "big-pickle", name: "Big Pickle" },
      { id: "kimi-k2.7-code", name: "Kimi K2.7 Code" },
    ],
  },
};
const SIGNED_IN: LinkStatus = {
  token: TOKEN,
  signIn: null,
  account: {
    providerId: "openai",
    method: "sign_in",
    model: "gpt-6.1-sol",
    models: [{ id: "gpt-6.1-sol", name: "GPT-6.1 Sol" }],
  },
};
const SIGNING_IN: LinkStatus = {
  token: TOKEN,
  account: null,
  signIn: {
    providerId: "openai",
    url: AUTHORIZE,
    prompt: {
      id: "q_3fA9x1",
      kind: "manual_code",
      message: "Complete login in your browser, or paste the final redirect URL here:",
      placeholder: CALLBACK,
    },
  },
};

function openApp() {
  render(
    <AccountLinkProvider>
      <AccountLinkButton />
    </AccountLinkProvider>,
  );
}

const popUp = (name = "Link your AI account") => screen.findByRole("dialog", { name });

beforeEach(() => {
  api.getLinkStatus.mockResolvedValue(NOTHING);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
  window.localStorage.clear();
});

describe("the account pop-up when the app opens", () => {
  it("asks for an account when this browser has none, offering a sign-in and an API key", async () => {
    openApp();

    const dialog = within(await popUp());

    expect(dialog.getByRole("button", { name: "Sign in with ChatGPT" })).toBeEnabled();
    expect(dialog.getByLabelText("API key")).toHaveAttribute("type", "password");
    const providers = within(dialog.getByLabelText("Provider")).getAllByRole("option");
    expect(providers.map((option) => option.textContent)).toEqual([
      "OpenAI",
      "OpenCode Zen",
      "OpenCode Go",
    ]);
    expect(dialog.getByLabelText("Provider")).toHaveValue("opencode");
    expect(dialog.getByRole("button", { name: "Link account" })).toBeDisabled();
    expect(api.getLinkStatus).not.toHaveBeenCalled();
    expect(screen.getByText("Not linked")).toBeInTheDocument();
  });

  it("stays closed when this browser already has an account linked", async () => {
    window.localStorage.setItem("motif.link", TOKEN);
    api.getLinkStatus.mockResolvedValue(LINKED);

    openApp();

    expect(await screen.findByText("OpenCode Zen · kimi-k2.7-code")).toBeInTheDocument();
    expect(api.getLinkStatus).toHaveBeenCalledExactlyOnceWith({ data: { token: TOKEN } });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("drops a token the server no longer knows, and asks again", async () => {
    window.localStorage.setItem("motif.link", TOKEN);

    openApp();

    await popUp();
    expect(window.localStorage.getItem("motif.link")).toBeNull();
  });

  it("asks, but keeps the token, when the server does not answer", async () => {
    window.localStorage.setItem("motif.link", TOKEN);
    api.getLinkStatus.mockRejectedValue(new TypeError("Failed to fetch"));

    openApp();

    await popUp();
    expect(window.localStorage.getItem("motif.link")).toBe(TOKEN);
  });

  it("can be put off, and comes back from the sidebar", async () => {
    openApp();
    const dialog = await popUp();

    fireEvent.click(within(dialog).getByRole("button", { name: "Not now" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /AI account/ }));
    await popUp();
  });
});

describe("linking with an API key", () => {
  it("sends the key to the server once and keeps only the token it gets back", async () => {
    api.linkApiKey.mockResolvedValue({ status: LINKED, error: null });
    openApp();
    const dialog = within(await popUp());

    fireEvent.change(dialog.getByLabelText("API key"), { target: { value: KEY } });
    fireEvent.click(dialog.getByRole("button", { name: "Link account" }));

    expect(await dialog.findByText(/with an API key/)).toHaveTextContent(
      "Linked to OpenCode Zen with an API key.",
    );
    expect(api.linkApiKey).toHaveBeenCalledExactlyOnceWith({
      data: { token: null, providerId: "opencode", apiKey: KEY },
    });
    expect(dialog.getByLabelText("Model")).toHaveValue("kimi-k2.7-code");
    expect({ ...window.localStorage }).toEqual({ "motif.link": TOKEN });
    expect(document.body.innerHTML).not.toContain(KEY);
    expect(screen.getByText("OpenCode Zen · kimi-k2.7-code")).toBeInTheDocument();
  });

  it("uses the chosen provider", async () => {
    api.linkApiKey.mockResolvedValue({ status: NOTHING, error: null });
    openApp();
    const dialog = within(await popUp());

    fireEvent.change(dialog.getByLabelText("Provider"), { target: { value: "opencode-go" } });
    fireEvent.change(dialog.getByLabelText("API key"), { target: { value: KEY } });
    fireEvent.click(dialog.getByRole("button", { name: "Link account" }));

    await waitFor(() =>
      expect(api.linkApiKey).toHaveBeenCalledExactlyOnceWith({
        data: { token: null, providerId: "opencode-go", apiKey: KEY },
      }),
    );
  });

  it("says why the server refused, and that it did not answer", async () => {
    const refusal =
      "That doesn't look like an API key. Paste it exactly as your provider shows it.";
    api.linkApiKey.mockResolvedValueOnce({ status: NOTHING, error: refusal });
    api.linkApiKey.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    openApp();
    const dialog = within(await popUp());
    fireEvent.change(dialog.getByLabelText("API key"), { target: { value: "!touch /tmp/x" } });

    fireEvent.click(dialog.getByRole("button", { name: "Link account" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent(refusal);

    fireEvent.click(dialog.getByRole("button", { name: "Link account" }));
    await waitFor(() =>
      expect(dialog.getByRole("alert")).toHaveTextContent(
        "Motif's server didn't answer. Try again.",
      ),
    );
    expect(window.localStorage.getItem("motif.link")).toBeNull();
  });

  it("changes the model and unlinks", async () => {
    window.localStorage.setItem("motif.link", TOKEN);
    api.getLinkStatus.mockResolvedValue(LINKED);
    const changed = { ...LINKED, account: { ...LINKED.account!, model: "big-pickle" } };
    api.chooseModel.mockResolvedValue({ status: changed, error: null });
    api.unlinkAccount.mockResolvedValue(NOTHING);
    openApp();
    fireEvent.click(await screen.findByRole("button", { name: /AI account/ }));
    const dialog = within(await popUp("Your AI account"));
    expect(dialog.getByRole("button", { name: "Done" })).toHaveFocus();

    fireEvent.change(await dialog.findByLabelText("Model"), { target: { value: "big-pickle" } });

    expect(await screen.findByText("OpenCode Zen · big-pickle")).toBeInTheDocument();
    expect(api.chooseModel).toHaveBeenCalledExactlyOnceWith({
      data: { token: TOKEN, model: "big-pickle" },
    });

    fireEvent.click(dialog.getByRole("button", { name: "Unlink" }));

    expect(await dialog.findByRole("button", { name: "Link account" })).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Link your AI account");
    expect(dialog.getByRole("button", { name: "Sign in with ChatGPT" })).toHaveFocus();
    expect(api.unlinkAccount).toHaveBeenCalledExactlyOnceWith({ data: { token: TOKEN } });
    expect(window.localStorage.getItem("motif.link")).toBeNull();
    expect(screen.getByText("Not linked")).toBeInTheDocument();
  });
});

describe("linking with a provider sign-in", () => {
  async function startSignIn() {
    api.startSignIn.mockResolvedValue({ status: SIGNING_IN, error: null });
    api.getLinkStatus.mockResolvedValue(SIGNING_IN);
    openApp();
    const dialog = within(await popUp());
    fireEvent.click(dialog.getByRole("button", { name: "Sign in with ChatGPT" }));
    const link = await dialog.findByRole("link", { name: /Open the OpenAI sign-in page/ });
    return { dialog, link };
  }

  it("links to the provider's page in a new tab and takes the pasted redirect address", async () => {
    api.answerSignIn.mockResolvedValue({ status: SIGNED_IN, error: null });
    const { dialog, link } = await startSignIn();

    expect(api.startSignIn).toHaveBeenCalledExactlyOnceWith({
      data: { token: null, providerId: "openai" },
    });
    expect(link).toHaveAttribute("href", AUTHORIZE);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveFocus();
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "Finish signing in to OpenAI to link your account.",
    );
    expect(window.localStorage.getItem("motif.link")).toBe(TOKEN);

    const pasted = `${CALLBACK}?code=ac_9f2&state=abc&client_id=app_71`;
    const field = dialog.getByPlaceholderText(CALLBACK);
    fireEvent.change(field, { target: { value: `  ${pasted} ` } });
    fireEvent.click(dialog.getByRole("button", { name: "Continue" }));

    expect(await dialog.findByText(/with your subscription sign-in/)).toBeInTheDocument();
    expect(api.answerSignIn).toHaveBeenCalledExactlyOnceWith({
      data: { token: TOKEN, promptId: "q_3fA9x1", value: pasted },
    });
    expect(dialog.getByLabelText("Model")).toHaveValue("gpt-6.1-sol");
  });

  it("keeps asking the server, and moves on when the sign-in is done", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { dialog } = await startSignIn();
    expect(api.getLinkStatus).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(api.getLinkStatus).toHaveBeenCalledExactlyOnceWith({ data: { token: TOKEN } });
    expect(dialog.getByRole("link", { name: /Open the OpenAI sign-in page/ })).toBeInTheDocument();

    api.getLinkStatus.mockResolvedValue(SIGNED_IN);
    await act(() => vi.advanceTimersByTimeAsync(2000));

    expect(await dialog.findByText(/with your subscription sign-in/)).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(api.getLinkStatus).toHaveBeenCalledTimes(2);
  });

  it("ignores a status check that was already on its way when the visitor cancelled", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.cancelSignIn.mockResolvedValue(NOTHING);
    const { dialog } = await startSignIn();
    let answerCheck: (status: LinkStatus) => void = () => {};
    api.getLinkStatus.mockReturnValue(new Promise((resolve) => (answerCheck = resolve)));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(api.getLinkStatus).toHaveBeenCalledTimes(1);

    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await dialog.findByRole("button", { name: "Sign in with ChatGPT" });
    await act(async () => answerCheck(SIGNING_IN));

    expect(dialog.getByRole("button", { name: "Sign in with ChatGPT" })).toBeInTheDocument();
    expect(dialog.queryByRole("link")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("motif.link")).toBeNull();
  });

  it("gives the sign-in up when the pop-up is cancelled or closed", async () => {
    api.cancelSignIn.mockResolvedValue(NOTHING);
    const { dialog } = await startSignIn();

    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));

    expect(await dialog.findByRole("button", { name: "Sign in with ChatGPT" })).toBeEnabled();
    expect(api.cancelSignIn).toHaveBeenCalledExactlyOnceWith({ data: { token: TOKEN } });
    expect(window.localStorage.getItem("motif.link")).toBeNull();

    api.startSignIn.mockResolvedValue({ status: SIGNING_IN, error: null });
    fireEvent.click(dialog.getByRole("button", { name: "Sign in with ChatGPT" }));
    await dialog.findByRole("link", { name: /Open the OpenAI sign-in page/ });
    fireEvent.click(dialog.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.cancelSignIn).toHaveBeenCalledTimes(2);
  });

  it("shows why a sign-in failed and starts it again", async () => {
    const failed: LinkStatus = {
      token: TOKEN,
      account: null,
      signIn: { providerId: "openai", url: AUTHORIZE, error: "OAuth state mismatch" },
    };
    api.startSignIn.mockResolvedValueOnce({ status: failed, error: null });
    openApp();
    const dialog = within(await popUp());

    fireEvent.click(dialog.getByRole("button", { name: "Sign in with ChatGPT" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent("OAuth state mismatch");
    expect(dialog.queryByRole("link")).not.toBeInTheDocument();

    api.startSignIn.mockResolvedValueOnce({ status: SIGNING_IN, error: null });
    fireEvent.click(dialog.getByRole("button", { name: "Try again" }));

    await dialog.findByRole("link", { name: /Open the OpenAI sign-in page/ });
    expect(api.startSignIn).toHaveBeenLastCalledWith({
      data: { token: TOKEN, providerId: "openai" },
    });
  });

  it("dismisses a failed sign-in when the pop-up is closed", async () => {
    const failed: LinkStatus = {
      token: TOKEN,
      account: null,
      signIn: { providerId: "openai", error: "ChatGPT authorization failed: access_denied" },
    };
    api.startSignIn.mockResolvedValue({ status: failed, error: null });
    api.cancelSignIn.mockResolvedValue(NOTHING);
    openApp();
    const dialog = within(await popUp());
    fireEvent.click(dialog.getByRole("button", { name: "Sign in with ChatGPT" }));
    await dialog.findByRole("alert");

    fireEvent.click(dialog.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.cancelSignIn).toHaveBeenCalledExactlyOnceWith({ data: { token: TOKEN } });
    await waitFor(() => expect(window.localStorage.getItem("motif.link")).toBeNull());
  });

  it("tells a visitor to wait when the server is busy with another sign-in", async () => {
    const busy = "Someone else is signing in on this server right now. Try again in a minute.";
    api.startSignIn.mockResolvedValue({ status: NOTHING, error: busy });
    openApp();
    const dialog = within(await popUp());

    fireEvent.click(dialog.getByRole("button", { name: "Sign in with ChatGPT" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(busy);
    expect(dialog.getByRole("button", { name: "Sign in with ChatGPT" })).toBeEnabled();
  });
});
