// A per-browser principal is the owner key for provider connections. It is an opaque, signed,
// HttpOnly cookie: JavaScript cannot read it, and no API key, OAuth token, client secret or
// refresh token is ever placed in it. Real user identity/RLS still requires the deployment's
// identity provider; see docs/provider-auth.md.

import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";

const COOKIE_NAME = "motif.principal";
const ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const EPHEMERAL_SECRET = Symbol.for("motif.ephemeralSessionSecret");
const PRINCIPAL_CONTEXT = new AsyncLocalStorage<string>();

/** Used by tests and by server-side jobs that already have an authenticated owner id. */
export function withPrincipal<T>(principalId: string, fn: () => T | Promise<T>): Promise<T> {
  if (!ID_PATTERN.test(principalId)) throw new Error("Invalid principal id");
  return Promise.resolve(PRINCIPAL_CONTEXT.run(principalId, fn));
}

function sessionSecret(): Buffer {
  const configured = process.env["MOTIF_SESSION_SECRET"];
  if (configured && configured.length >= 32) return Buffer.from(configured, "utf8");
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "MOTIF_SESSION_SECRET must be set to a random value of at least 32 characters.",
    );
  }
  const scope = globalThis as { [EPHEMERAL_SECRET]?: Buffer };
  return (scope[EPHEMERAL_SECRET] ??= randomBytes(32));
}

function signature(id: string): Buffer {
  return createHmac("sha256", sessionSecret()).update(`motif-principal-v1:${id}`).digest();
}

function signedValue(id: string): string {
  return `${id}.${signature(id).toString("base64url")}`;
}

function verifiedId(value: string | undefined): string | null {
  if (!value) return null;
  const [id, mac, ...rest] = value.split(".");
  if (!id || !mac || rest.length > 0 || !ID_PATTERN.test(id)) return null;
  let given: Buffer;
  try {
    given = Buffer.from(mac, "base64url");
  } catch {
    return null;
  }
  const expected = signature(id);
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

function requestIsSecure(): boolean {
  const base = process.env["MOTIF_PUBLIC_BASE_URL"];
  if (base?.startsWith("https://")) return true;
  try {
    const request = getRequest();
    const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwarded ?? new URL(request.url).protocol.replace(":", "");
    return protocol === "https";
  } catch {
    return false;
  }
}

/** OAuth callbacks must not mint a new owner when the initiating session is missing. */
export function existingPrincipal(): string | null {
  return PRINCIPAL_CONTEXT.getStore() ?? verifiedId(getCookie(COOKIE_NAME));
}

/**
 * Returns the caller's verified principal, creating a fresh signed cookie when necessary.
 * Never accepts a principal supplied by the browser as plain data.
 */
export function currentPrincipal(): string {
  const scoped = PRINCIPAL_CONTEXT.getStore();
  if (scoped) return scoped;

  try {
    const existing = verifiedId(getCookie(COOKIE_NAME));
    if (existing) return existing;

    const id = randomBytes(32).toString("base64url");
    setCookie(COOKIE_NAME, signedValue(id), {
      httpOnly: true,
      sameSite: "lax",
      secure: requestIsSecure(),
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    });
    return id;
  } catch {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error("The signed principal cookie could not be established.");
    }
    // Outside a request (unit tests / build tooling) an ephemeral id is safe and isolated.
    return randomBytes(32).toString("base64url");
  }
}
