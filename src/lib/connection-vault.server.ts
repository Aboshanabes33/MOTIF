// Server-side encrypted connection store. Every credential and OAuth flow is serialized into one
// AES-256-GCM envelope; the file on disk never contains a raw API key, access token, refresh token
// or PKCE verifier. Metadata and credentials are isolated by the signed principal id.
//
// This is a process-local, encrypted file vault with a provider-agnostic interface. A multi-node
// production deployment should replace this implementation with the configured secret manager and
// owner-scoped metadata table; callers depend on the exported interface, not this file.

import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type {
  AuthOperationOptions,
  Credential,
  CredentialInfo,
  CredentialStore,
} from "@earendil-works/pi-ai";

import type {
  AuthMethodId,
  ConnectionMethod,
  ConnectionStatus,
  LinkModel,
  ProviderId,
} from "./provider-registry";

const AAD = Buffer.from("motif-provider-connections-v1");
const VAULT_STATE = Symbol.for("motif.connectionVaultState");
const EPHEMERAL_KEY = Symbol.for("motif.ephemeralCredentialsKey");

export type ConnectionMetadata = {
  providerId: ProviderId;
  method: ConnectionMethod;
  status: ConnectionStatus;
  modelId: string;
  models?: LinkModel[];
  revision?: string;
  expiresAt?: number;
  connectedAt: number;
  updatedAt: number;
  note?: string;
};

export type OAuthFlow = {
  state: string;
  providerId: ProviderId;
  method: AuthMethodId;
  verifier: string;
  challenge: string;
  redirectUri: string;
  createdAt: number;
  expiresAt: number;
  generation?: string;
};

type StoredConnection = {
  credential: Credential;
  metadata: ConnectionMetadata;
};

type PrincipalRecord = {
  connections: Record<string, StoredConnection>;
  flows: Record<string, OAuthFlow>;
  generations?: Partial<Record<ProviderId, string>>;
  /** The connection currently serving AI requests for this principal. */
  activeProviderId: string | null;
};

type VaultPayload = {
  version: 1;
  principals: Record<string, PrincipalRecord>;
};

type CipherEnvelope = {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
};

type VaultState = {
  path: string;
  payload: VaultPayload | null;
  chain: Promise<void>;
};

function emptyPayload(): VaultPayload {
  return { version: 1, principals: {} };
}

function vaultPath(): string {
  const configured = process.env["MOTIF_SECRETS_FILE"];
  return configured ? resolve(configured) : resolve(process.cwd(), ".motif", "connections.enc");
}

function state(): VaultState {
  const scope = globalThis as { [VAULT_STATE]?: VaultState };
  const path = vaultPath();
  if (!scope[VAULT_STATE] || scope[VAULT_STATE]!.path !== path) {
    scope[VAULT_STATE] = { path, payload: null, chain: Promise.resolve() };
  }
  return scope[VAULT_STATE]!;
}

function credentialsKey(): Buffer {
  const configured = process.env["MOTIF_CREDENTIALS_KEY"];
  if (configured) {
    const key = Buffer.from(configured, "base64");
    if (key.length !== 32) {
      throw new Error("MOTIF_CREDENTIALS_KEY must be a base64-encoded 32-byte key.");
    }
    return key;
  }
  const session = process.env["MOTIF_SESSION_SECRET"];
  if (session && session.length >= 32) {
    return Buffer.from(hkdfSync("sha256", Buffer.from(session, "utf8"), Buffer.alloc(0), AAD, 32));
  }
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "MOTIF_CREDENTIALS_KEY or MOTIF_SESSION_SECRET must be configured in production.",
    );
  }
  const scope = globalThis as { [EPHEMERAL_KEY]?: Buffer };
  return (scope[EPHEMERAL_KEY] ??= randomBytes(32));
}

function encrypt(payload: VaultPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialsKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const envelope: CipherEnvelope = {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return JSON.stringify(envelope);
}

function decrypt(raw: string): VaultPayload {
  try {
    const envelope = JSON.parse(raw) as CipherEnvelope;
    if (envelope.version !== 1) throw new Error("unsupported envelope");
    const iv = Buffer.from(envelope.iv, "base64");
    const tag = Buffer.from(envelope.tag, "base64");
    const ciphertext = Buffer.from(envelope.ciphertext, "base64");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
      throw new Error("invalid envelope");
    }
    const decipher = createDecipheriv("aes-256-gcm", credentialsKey(), iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const payload = JSON.parse(plain) as VaultPayload;
    if (
      payload.version !== 1 ||
      typeof payload.principals !== "object" ||
      payload.principals === null
    ) {
      throw new Error("invalid payload");
    }
    return payload;
  } catch {
    // Deliberately generic: a wrong key or corrupt vault must fail closed, never be overwritten.
    throw new Error(
      "The encrypted connection store could not be opened. Check the encryption key.",
    );
  }
}

async function ensureLoaded(current: VaultState): Promise<void> {
  if (current.payload) return;
  try {
    current.payload = decrypt(await readFile(current.path, "utf8"));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      current.payload = emptyPayload();
      return;
    }
    throw error;
  }
}

async function persist(current: VaultState): Promise<void> {
  if (!current.payload) return;
  await mkdir(dirname(current.path), { recursive: true, mode: 0o700 });
  const temp = `${current.path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temp, encrypt(current.payload), { mode: 0o600 });
    await rename(temp, current.path);
    await chmod(current.path, 0o600).catch(() => {});
  } finally {
    await unlink(temp).catch(() => {});
  }
}

/** One serialized read-modify-write per process. Shared stores must supply cross-process locking. */
function serialize<T>(fn: (current: VaultState) => Promise<T>): Promise<T> {
  const current = state();
  const run = current.chain.then(
    () => fn(current),
    () => fn(current),
  );
  current.chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function inspect<T>(fn: (payload: VaultPayload) => T | Promise<T>): Promise<T> {
  return serialize(async (current) => {
    await ensureLoaded(current);
    return fn(current.payload!);
  });
}

async function mutate<T>(fn: (payload: VaultPayload) => T | Promise<T>): Promise<T> {
  return serialize(async (current) => {
    await ensureLoaded(current);
    const draft = { ...current, payload: clone(current.payload!) };
    const result = await fn(draft.payload);
    await persist(draft);
    current.payload = draft.payload;
    return result;
  });
}

function principalRecord(payload: VaultPayload, principalId: string): PrincipalRecord {
  const existing = payload.principals[principalId];
  if (existing) return existing;
  const created: PrincipalRecord = { connections: {}, flows: {}, activeProviderId: null };
  payload.principals[principalId] = created;
  return created;
}

function isCredential(value: unknown): value is Credential {
  if (!value || typeof value !== "object") return false;
  const credential = value as Record<string, unknown>;
  if (credential["type"] === "api_key") {
    return credential["key"] === undefined || typeof credential["key"] === "string";
  }
  if (credential["type"] === "oauth") {
    return (
      typeof credential["access"] === "string" &&
      typeof credential["refresh"] === "string" &&
      typeof credential["expires"] === "number"
    );
  }
  return false;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function defaultMetadata(providerId: string, credential: Credential): ConnectionMetadata {
  const now = Date.now();
  const method: ConnectionMethod = credential.type === "oauth" ? "openrouter_pkce" : "api_key";
  return {
    providerId: providerId as ProviderId,
    method,
    status: "needs_reconnect",
    modelId: "",
    connectedAt: now,
    updatedAt: now,
    note: "Credential is stored but has not been validated for use yet.",
  };
}

export class VaultCredentialStore implements CredentialStore {
  constructor(private readonly principalId: string) {}

  read(providerId: string, options?: AuthOperationOptions): Promise<Credential | undefined> {
    options?.signal?.throwIfAborted();
    return inspect((payload) => {
      const stored = principalRecord(payload, this.principalId).connections[providerId]?.credential;
      return stored && isCredential(stored) ? clone(stored) : undefined;
    });
  }

  list(options?: AuthOperationOptions): Promise<readonly CredentialInfo[]> {
    options?.signal?.throwIfAborted();
    return inspect((payload) =>
      Object.entries(principalRecord(payload, this.principalId).connections).flatMap(
        ([providerId, stored]) =>
          isCredential(stored.credential)
            ? [{ providerId, type: stored.credential.type } as CredentialInfo]
            : [],
      ),
    );
  }

  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    options?.signal?.throwIfAborted();
    return mutate(async (payload) => {
      const record = principalRecord(payload, this.principalId);
      const current = record.connections[providerId]?.credential;
      const currentCopy = current && isCredential(current) ? clone(current) : undefined;
      const next = await fn(currentCopy);
      if (next === undefined) return currentCopy;
      if (!isCredential(next)) throw new Error("Invalid credential shape");
      const stored = record.connections[providerId];
      record.connections[providerId] = {
        credential: clone(next),
        metadata: stored?.metadata ?? defaultMetadata(providerId, next),
      };
      return clone(next);
    });
  }

  delete(providerId: string, options?: AuthOperationOptions): Promise<void> {
    options?.signal?.throwIfAborted();
    return mutate((payload) => {
      delete principalRecord(payload, this.principalId).connections[providerId];
    });
  }
}

export function credentialStoreFor(principalId: string): CredentialStore {
  return new VaultCredentialStore(principalId);
}

export function listConnections(principalId: string): Promise<ConnectionMetadata[]> {
  return inspect((payload) =>
    Object.values(principalRecord(payload, principalId).connections).flatMap((stored) =>
      isCredential(stored.credential) ? [clone(stored.metadata)] : [],
    ),
  );
}

export function getConnection(
  principalId: string,
  providerId: ProviderId,
): Promise<ConnectionMetadata | undefined> {
  return inspect((payload) => {
    const stored = principalRecord(payload, principalId).connections[providerId];
    return stored && isCredential(stored.credential) ? clone(stored.metadata) : undefined;
  });
}

/** Metadata is written only after a credential has been validated by the auth layer. */
export function putConnection(principalId: string, metadata: ConnectionMetadata): Promise<void> {
  return mutate((payload) => {
    const record = principalRecord(payload, principalId);
    const stored = record.connections[metadata.providerId];
    if (!stored || !isCredential(stored.credential)) {
      throw new Error("Refusing to record a connection without a stored credential");
    }
    stored.metadata = clone(metadata);
  });
}

/** A disconnect invalidates even a validation/exchange that is still in flight. */
export function generationFor(
  principalId: string,
  provider: ProviderId,
): Promise<string | undefined> {
  return inspect((payload) => principalRecord(payload, principalId).generations?.[provider]);
}

/** Publish a validated replacement, its discovered models and active selection together. */
export function connect(
  principalId: string,
  key: string,
  metadata: ConnectionMetadata,
  generation?: string,
): Promise<boolean> {
  return mutate((payload) => {
    const record = principalRecord(payload, principalId);
    if (record.generations?.[metadata.providerId] !== generation) return false;
    const revision = randomBytes(16).toString("hex");
    (record.generations ??= {})[metadata.providerId] = revision;
    record.connections[metadata.providerId] = {
      credential: { type: "api_key", key },
      metadata: { ...metadata, revision },
    };
    record.activeProviderId = metadata.providerId;
    return true;
  });
}

/** Ignore late results for a credential that was replaced or disconnected mid-request. */
export function updateConnection(
  principalId: string,
  observed: ConnectionMetadata,
  change: { status: ConnectionStatus } | { modelId: string },
): Promise<boolean> {
  return mutate((payload) => {
    const record = principalRecord(payload, principalId);
    const current = record.connections[observed.providerId]?.metadata;
    if (!current || current.status === "needs_reconnect" || current.revision !== observed.revision)
      return false;
    if ("modelId" in change) {
      if (current.expiresAt !== undefined && current.expiresAt <= Date.now()) return false;
      record.activeProviderId = current.providerId;
    }
    Object.assign(current, change, { updatedAt: Date.now() });
    return true;
  });
}

export function deleteConnection(principalId: string, providerId: ProviderId): Promise<void> {
  return mutate((payload) => {
    const record = principalRecord(payload, principalId);
    (record.generations ??= {})[providerId] = randomBytes(16).toString("hex");
    delete record.connections[providerId];
    if (record.activeProviderId === providerId)
      record.activeProviderId = Object.keys(record.connections)[0] ?? null;
    for (const flow of Object.values(record.flows))
      if (flow.providerId === providerId) delete record.flows[flow.state];
  });
}

export function saveFlow(principalId: string, flow: OAuthFlow): Promise<void> {
  return mutate((payload) => {
    const record = principalRecord(payload, principalId);
    for (const [state, existing] of Object.entries(record.flows)) {
      if (existing.expiresAt <= Date.now()) delete record.flows[state];
    }
    const generation = record.generations?.[flow.providerId];
    record.flows[flow.state] = { ...clone(flow), ...(generation ? { generation } : {}) };
  });
}

/** Consumes a one-time flow. Replay, wrong owner, expiry and mismatch are all rejected. */
export function consumeFlow(principalId: string, state: string): Promise<OAuthFlow | null> {
  return mutate((payload) => {
    const record = principalRecord(payload, principalId);
    const flow = record.flows[state];
    if (!flow) return null;
    delete record.flows[state];
    if (flow.expiresAt <= Date.now() || flow.state !== state) return null;
    return clone(flow);
  });
}

export function clearPendingFlows(principalId: string): Promise<void> {
  return mutate((payload) => {
    principalRecord(payload, principalId).flows = {};
  });
}

/** Safe pending-sign-in summary: provider and start time only, never state or verifier. */
export function listPendingFlows(
  principalId: string,
): Promise<{ providerId: ProviderId; startedAt: number }[]> {
  return inspect((payload) => {
    const now = Date.now();
    return Object.values(principalRecord(payload, principalId).flows)
      .filter((flow) => flow.expiresAt > now)
      .map((flow) => ({ providerId: flow.providerId, startedAt: flow.createdAt }));
  });
}

export function getActiveProvider(principalId: string): Promise<ProviderId | null> {
  return inspect((payload) => {
    const record = principalRecord(payload, principalId);
    const active = record.activeProviderId;
    if (!active) return null;
    return record.connections[active] ? (active as ProviderId) : null;
  });
}

/** Sets the active connection. Pass null to clear, or an existing connected provider id. */
export function setActiveProvider(
  principalId: string,
  providerId: ProviderId | null,
): Promise<void> {
  return mutate((payload) => {
    const record = principalRecord(payload, principalId);
    if (providerId !== null && !record.connections[providerId]) {
      throw new Error("Cannot activate a provider without a stored credential");
    }
    record.activeProviderId = providerId;
    if (providerId) record.connections[providerId]!.metadata.updatedAt = Date.now();
  });
}

/** Test-only reset for the in-memory decrypted view. Does not delete the encrypted file. */
export function __resetVaultForTests(): void {
  delete (globalThis as { [VAULT_STATE]?: VaultState })[VAULT_STATE];
  delete (globalThis as { [EPHEMERAL_KEY]?: Buffer })[EPHEMERAL_KEY];
}
