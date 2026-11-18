import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright-core";

test(
  "provider consent, callback, model choice, inference, quota, disconnect and key reconnect",
  { timeout: 90000 },
  async (t) => {
    const tmp = await mkdtemp(join(tmpdir(), "motif-e2e-"));
    t.after(() => rm(tmp, { recursive: true, force: true }));
    const probe = createServer().listen(0, "127.0.0.1");
    await once(probe, "listening");
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    const server = spawn(
      process.execPath,
      ["--import", "./e2e/provider-network.mjs", ".output/server/index.mjs"],
      {
        env: {
          HOME: tmp,
          NODE_ENV: "production",
          HOST: "127.0.0.1",
          PORT: String(port),
          MOTIF_SESSION_SECRET: randomBytes(32).toString("hex"),
          MOTIF_SECRETS_FILE: join(tmp, "vault.enc"),
          MOTIF_PUBLIC_BASE_URL: origin,
        },
        stdio: ["ignore", "pipe", "inherit"],
      },
    );
    t.after(() => server.kill());
    await Promise.race([
      once(server.stdout, "data"),
      once(server, "exit").then(() => {
        throw Error("Build the app before running E2E");
      }),
    ]);
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
    t.after(() => browser.close());
    const page = await browser.newPage();
    page.setDefaultTimeout(12000);
    let deny = true;
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (url.origin !== "https://openrouter.ai" || url.pathname !== "/auth") return route.abort();
      const dest = new URL(url.searchParams.get("callback_url"));
      assert.equal(dest.origin, origin);
      dest.searchParams.set("state", url.searchParams.get("state"));
      dest.searchParams.set(
        deny ? "error" : "code",
        deny ? "access_denied" : url.searchParams.get("code_challenge"),
      );
      return route.fulfill({ status: 302, headers: { Location: dest.href } });
    });
    const noSession = await fetch(
      `${origin}/api/auth/openrouter/callback?state=missing&code=fixture&return_to=https://untrusted.example`,
      { redirect: "manual" },
    );
    assert.equal(noSession.status, 303);
    assert.equal(noSession.headers.get("location"), "/?connection_error=session");
    assert.equal(noSession.headers.get("referrer-policy"), "no-referrer");
    await page.goto(origin);
    const signIn = page.getByRole("button", { name: "Connect with OpenRouter" });
    await signIn.click();
    await page.getByText(/sign-in was cancelled/).waitFor();
    deny = false;
    await signIn.click();
    await page.getByText("OpenRouter is connected.").waitFor();
    const model = "google/gemma-4-31b-it:free";
    await page.getByRole("dialog").getByRole("combobox").selectOption(model);
    await page.getByText(`OpenRouter · ${model}`, { exact: true }).waitFor({ state: "attached" });
    await page.reload();
    await page.getByText(`OpenRouter · ${model}`, { exact: true }).waitFor();
    async function send(prompt) {
      await page.locator("textarea").fill(prompt);
      await page.getByRole("button", { name: "Send", exact: true }).click();
    }
    await send("test edit");
    await page.getByText(`Fixture reply from ${model}`, { exact: true }).waitFor();
    await send("quota-probe");
    await page.getByText(/out of quota or rate limited/).waitFor();
    await page.getByRole("button", { name: /AI account/ }).click();
    await page.getByText(/Quota or rate limit reached/).waitFor();
    await page.getByLabel("Disconnect OpenRouter").click();
    await page.getByRole("button", { name: "Confirm disconnect" }).click();
    await page.getByText("Not connected", { exact: true }).waitFor({ state: "attached" });
    await page
      .getByLabel("OpenRouter API key", { exact: true })
      .fill("fixture-openrouter-replacement");
    await page.getByRole("button", { name: "Link OpenRouter API key" }).click();
    await page.getByRole("dialog").getByRole("combobox").waitFor();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.goto(origin);
    await send("test replacement");
    await page.getByText("Fixture reply from openrouter/auto", { exact: true }).waitFor();
  },
);
