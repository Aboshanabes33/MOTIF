import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { vi } from "vitest";

import { __resetVaultForTests } from "@/lib/connection-vault.server";

/** Gives one test an isolated encrypted vault file and deterministic secrets. */
export function createTempVault(): { dir: string; file: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "motif-vault-test-"));
  const file = join(dir, "connections.enc");
  vi.stubEnv("MOTIF_SECRETS_FILE", file);
  vi.stubEnv("MOTIF_SESSION_SECRET", "test-session-secret-with-at-least-thirty-two-characters");
  vi.stubEnv("MOTIF_CREDENTIALS_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("MOTIF_PUBLIC_BASE_URL", "https://motif.test");
  __resetVaultForTests();
  return {
    dir,
    file,
    cleanup: () => {
      __resetVaultForTests();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A principal id that satisfies the server's opaque-cookie shape. */
export function principal(letter: string): string {
  return letter.repeat(43);
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
