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
const AUTHORIZE = "https://auth.openai.com/api/accounts/authorize?client_id=dynamic_agent_client";
const DEVICE_PAGE = "https://auth.openai.com/codex/device";

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
    providerId: "openai-codex",
    method: "sign_in",
    model: "gpt-6.1-sol",
    models: [{ id: "gpt-6.1-sol", name: "GPT-6.1 Sol" }],
  },
};

/** What the pop-up shows while a one-time code waits for approval: one code, nothing else. */
const WAITING_FOR_CODE: LinkStatus = {
  token: TOKEN,
  account: null,
  signIn: {
    providerId: "openai-codex",
    kind: "device_code",
    code: { value: "WDJB-MJHT", url: DEVICE_PAGE },
    message: "Waiting for you to approve",
  },
};

/** What a local build shows when the browser's redirect did not arrive. */
const SIGNING_IN: LinkStatus = {
  token: TOKEN,
  account: null,
  signIn: {
    providerId: "openai-codex",
    kind: "browser",
    url: AUTHORIZE,
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

    expect(dialog.getByRole("button", { name: "Connect ChatGPT" })).toBeEnabled();
    expect(dialog.getByLabelText("API key")).toHaveAttribute("type", "password");
    const providers = within(dialog.getByLabelText("Provider")).getAllByRole("option");
    // ChatGPT is not here: it has no API key, so the key form must not offer it.
    expect(providers.map((option) => option.textContent)).toEqual([
      "OpenAI (API key)",
      "OpenCode Zen",
      "OpenCode Go",
    ]);
    // The first provider that takes a key is the OpenAI key, and it is not the ChatGPT entry: that
    // one has no key, so offering it here would offer a field it cannot accept.
    expect(dialog.getByLabelText("Provider")).toHaveValue("openai");
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

    fireEvent.change(dialog.getByLabelText("Provider"), { target: { value: "opencode" } });
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
    expect(dialog.getByRole("button", { name: "Connect ChatGPT" })).toHaveFocus();
    expect(api.unlinkAccount).toHaveBeenCalledExactlyOnceWith({ data: { token: TOKEN } });
    expect(window.localStorage.getItem("motif.link")).toBeNull();
    expect(screen.getByText("Not linked")).toBeInTheDocument();
  });
});

describe("linking with a provider sign-in", () => {
  async function startSignIn(status: LinkStatus = WAITING_FOR_CODE) {
    api.startSignIn.mockResolvedValue({ status, error: null });
    api.getLinkStatus.mockResolvedValue(status);
    openApp();
    const dialog = within(await popUp());
    fireEvent.click(dialog.getByRole("button", { name: "Connect ChatGPT" }));
    // The click starts the sign-in; wait until the pop-up shows what it produced.
    if (status.signIn?.code) await dialog.findByText(status.signIn.code.value);
    else if (status.signIn?.url) await dialog.findByRole("link", { name: /^Open the ChatGPT/ });
    else if (status.signIn?.error) await dialog.findByRole("alert");
    return { dialog };
  }

  it("shows one code and a link, and asks for nothing to be pasted", async () => {
    const { dialog } = await startSignIn();

    // Two actions for the user: read the code, open the page. No field, no address to copy.
    expect(dialog.getByText("WDJB-MJHT")).toBeInTheDocument();
    const link = dialog.getByRole("link", { name: /Open the approval page/ });
    expect(link).toHaveAttribute("href", DEVICE_PAGE);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveFocus();
    expect(dialog.queryByRole("textbox")).not.toBeInTheDocument();
    expect(api.startSignIn).toHaveBeenCalledExactlyOnceWith({
      data: { token: null, providerId: "openai-codex" },
    });
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "Finish signing in to ChatGPT to link your account.",
    );
    expect(window.localStorage.getItem("motif.link")).toBe(TOKEN);
    // Nothing in the pop-up mentions a callback, a redirect or a URL to copy.
    expect(document.body.textContent).not.toMatch(/callback|redirect|paste/i);
  });

  it("keeps asking the server, and moves on when the sign-in is done", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { dialog } = await startSignIn();
    expect(api.getLinkStatus).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(api.getLinkStatus).toHaveBeenCalledExactlyOnceWith({ data: { token: TOKEN } });
    expect(dialog.getByText("WDJB-MJHT")).toBeInTheDocument();

    api.getLinkStatus.mockResolvedValue(SIGNED_IN);
    await act(() => vi.advanceTimersByTimeAsync(2000));

    expect(await dialog.findByText(/with your subscription sign-in/)).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(api.getLinkStatus).toHaveBeenCalledTimes(2);
  });

  it("opens already connected when the provider approved before the pop-up drew", async () => {
    // The server can return the account from startSignIn itself for a device-code sign-in.
    api.startSignIn.mockResolvedValue({ status: SIGNED_IN, error: null });
    openApp();
    const dialog = within(await popUp());

    fireEvent.click(dialog.getByRole("button", { name: "Connect ChatGPT" }));

    expect(await dialog.findByText(/with your subscription sign-in/)).toBeInTheDocument();
    expect(dialog.getByLabelText("Model")).toHaveValue("gpt-6.1-sol");
    expect(api.getLinkStatus).not.toHaveBeenCalled();
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
    await dialog.findByRole("button", { name: "Connect ChatGPT" });
    await act(async () => answerCheck(WAITING_FOR_CODE));

    expect(dialog.getByRole("button", { name: "Connect ChatGPT" })).toBeInTheDocument();
    expect(dialog.queryByText("WDJB-MJHT")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("motif.link")).toBeNull();
  });

  it("gives the sign-in up when the pop-up is cancelled or closed", async () => {
    api.cancelSignIn.mockResolvedValue(NOTHING);
    const { dialog } = await startSignIn();

    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));

    expect(await dialog.findByRole("button", { name: "Connect ChatGPT" })).toBeEnabled();
    expect(api.cancelSignIn).toHaveBeenCalledExactlyOnceWith({ data: { token: TOKEN } });
    expect(window.localStorage.getItem("motif.link")).toBeNull();

    api.startSignIn.mockResolvedValue({ status: WAITING_FOR_CODE, error: null });
    fireEvent.click(dialog.getByRole("button", { name: "Connect ChatGPT" }));
    await dialog.findByText("WDJB-MJHT");
    fireEvent.click(dialog.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.cancelSignIn).toHaveBeenCalledTimes(2);
  });

  it("shows why a sign-in failed, in the provider's words, and starts it again", async () => {
    const failed: LinkStatus = {
      token: TOKEN,
      account: null,
      signIn: {
        providerId: "openai-codex",
        kind: "device_code",
        error: "OpenAI Codex device code login is not enabled for this server.",
      },
    };
    api.startSignIn.mockResolvedValueOnce({ status: failed, error: null });
    openApp();
    const dialog = within(await popUp());

    fireEvent.click(dialog.getByRole("button", { name: "Connect ChatGPT" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "OpenAI Codex device code login is not enabled for this server.",
    );
    expect(dialog.queryByText("WDJB-MJHT")).not.toBeInTheDocument();

    api.startSignIn.mockResolvedValueOnce({ status: WAITING_FOR_CODE, error: null });
    fireEvent.click(dialog.getByRole("button", { name: "Try again" }));

    await dialog.findByText("WDJB-MJHT");
    expect(api.startSignIn).toHaveBeenLastCalledWith({
      data: { token: TOKEN, providerId: "openai-codex" },
    });
  });

  it("dismisses a failed sign-in when the pop-up is closed", async () => {
    const failed: LinkStatus = {
      token: TOKEN,
      account: null,
      signIn: {
        providerId: "openai-codex",
        kind: "device_code",
        error: "ChatGPT authorization failed: access_denied",
      },
    };
    api.startSignIn.mockResolvedValue({ status: failed, error: null });
    api.cancelSignIn.mockResolvedValue(NOTHING);
    openApp();
    const dialog = within(await popUp());
    fireEvent.click(dialog.getByRole("button", { name: "Connect ChatGPT" }));
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

    fireEvent.click(dialog.getByRole("button", { name: "Connect ChatGPT" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(busy);
    expect(dialog.getByRole("button", { name: "Connect ChatGPT" })).toBeEnabled();
  });
});
