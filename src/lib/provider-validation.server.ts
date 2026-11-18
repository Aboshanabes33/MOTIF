// Authentication validation and provider model discovery. This layer asks "does this credential
// work, and what can it reach?" It never persists a credential and never performs inference.

import {
  apiKeyValidation,
  providerById,
  type KeyCheck,
  type KeyProblem,
  type LinkModel,
} from "./provider-registry";

export const API_KEY = /^[A-Za-z0-9][\w.~+/=:-]{7,511}$/;

const NOT_CHAT =
  /(?:^|\/)(?:whisper|tts|dall-e|embedding|text-embedding|omni-moderation|image|imagen|veo)/i;

export function validKeyShape(apiKey: string): boolean {
  return API_KEY.test(apiKey.trim());
}

function neverReached(error: unknown): boolean {
  let cause = error;
  for (let depth = 0; depth < 5 && cause instanceof Error; depth += 1) {
    if (cause.name === "TimeoutError" || cause.message === "fetch failed") return true;
    cause = cause.cause;
  }
  return false;
}

function problemFor(status: number): KeyProblem {
  if (status === 401) return "rejected";
  if (status === 403) return "forbidden";
  if (status === 402 || status === 429) return "limited";
  return "failed";
}

function headersFor(
  spec: NonNullable<ReturnType<typeof apiKeyValidation>>,
  apiKey: string,
): HeadersInit {
  const headers: Record<string, string> = { ...(spec.extraHeaders ?? {}) };
  if (spec.header === "bearer") headers["Authorization"] = `Bearer ${apiKey}`;
  if (spec.header === "anthropic") headers["x-api-key"] = apiKey;
  if (spec.header === "google") headers["x-goog-api-key"] = apiKey;
  return headers;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringField(entry: Record<string, unknown>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = entry[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

/** Reads the common provider catalogue shapes without trusting unknown fields. */
export function readCatalogue(providerId: string, body: unknown): LinkModel[] {
  const record = asRecord(body);
  const list = record?.["data"] ?? record?.["models"];
  if (!Array.isArray(list)) return [];
  const models: LinkModel[] = [];
  for (const raw of list) {
    const item = asRecord(raw);
    if (!item) continue;
    const rawId = stringField(item, "id", "name");
    if (!rawId) continue;
    const id = rawId.startsWith("models/") ? rawId.slice("models/".length) : rawId;
    if (NOT_CHAT.test(id)) continue;
    const methods = item["supportedGenerationMethods"];
    if (providerId === "google" && Array.isArray(methods) && !methods.includes("generateContent")) {
      continue;
    }
    const architecture = asRecord(item["architecture"]);
    const rawModalities =
      architecture?.["input_modalities"] ?? item["input_modalities"] ?? item["inputModalities"];
    const input = Array.isArray(rawModalities)
      ? rawModalities.filter(
          (modality): modality is "text" | "image" => modality === "text" || modality === "image",
        )
      : undefined;
    const pricing = asRecord(item["pricing"]);
    const free =
      id.endsWith(":free") ||
      (pricing !== undefined &&
        String(pricing["prompt"] ?? "") === "0" &&
        String(pricing["completion"] ?? "") === "0");
    const name = stringField(item, "display_name", "displayName", "name", "id") ?? id;
    const resolvedInput: LinkModel["input"] = input?.length ? [...input] : undefined;
    const model: LinkModel = {
      id,
      name: name.startsWith("models/") ? name.slice("models/".length) : name,
      ...(resolvedInput ? { input: resolvedInput } : {}),
      ...(free ? { free: true } : {}),
    };
    models.push(model);
  }
  return models;
}

/** Keeps Pi's runtime-capable models and enriches them with a validated provider catalogue. */
export function mergeModels(runtimeModels: LinkModel[], discovered: LinkModel[]): LinkModel[] {
  const byId = new Map(discovered.map((model) => [model.id, model]));
  return runtimeModels.flatMap((model) => {
    const extra = byId.get(model.id);
    if (!extra) return [];
    const input = model.input ?? extra.input;
    return {
      ...model,
      // Use the trusted runtime label, not arbitrary provider text in a client response.
      ...(input ? { input } : {}),
      ...(extra.free ? { free: true } : {}),
    };
  });
}

async function fetchCatalogue(
  url: string,
  headers: HeadersInit,
): Promise<{ ok: true; body: unknown } | { ok: false; problem: KeyProblem }> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    return { ok: false, problem: neverReached(error) ? "unreachable" : "failed" };
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    return { ok: false, problem: problemFor(response.status) };
  }
  try {
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false, problem: "failed" };
  }
}

/** Validates a key with its provider's cheapest official endpoint. Does not store the key. */
export async function checkApiKey(providerId: string, apiKey: string): Promise<KeyCheck> {
  const provider = providerById(providerId);
  const spec = apiKeyValidation(providerId);
  if (!provider || !spec) return { ok: false, problem: "shape" };
  const headers = headersFor(spec, apiKey);
  const check = await fetchCatalogue(spec.checkUrl, headers);
  if (!check.ok) return { ok: false, problem: check.problem };

  let detail: string | undefined;
  let expiresAt: number | undefined;
  let catalogueBody: unknown = check.body;
  if (providerId === "openrouter") {
    const data = asRecord(asRecord(check.body)?.["data"]);
    const expiration = data?.["expires_at"];
    if (typeof expiration === "string" && Number.isFinite(Date.parse(expiration)))
      expiresAt = Date.parse(expiration);
    const remaining = data?.["free_model_daily_requests"];
    const count = asRecord(remaining)?.["remaining"];
    if (typeof count === "number") detail = `Free models: ${count} requests left today.`;
    if (spec.modelsUrl) {
      const catalogue = await fetchCatalogue(spec.modelsUrl, headers);
      if (!catalogue.ok) return catalogue;
      catalogueBody = catalogue.body;
    }
  }
  const models = readCatalogue(providerId, catalogueBody);
  // Google and Anthropic paginate model discovery. Follow opaque cursors on the original
  // approved endpoint only, never a URL supplied by a catalogue response.
  const cursors = new Set<string>();
  while (providerId === "google" || providerId === "anthropic") {
    const page = asRecord(catalogueBody);
    const token =
      providerId === "google"
        ? page?.["nextPageToken"]
        : page?.["has_more"]
          ? page["last_id"]
          : null;
    if (!token) break;
    if (typeof token !== "string" || cursors.has(token) || cursors.size >= 20)
      return { ok: false, problem: "failed" };
    cursors.add(token);
    const nextUrl = new URL(spec.checkUrl);
    nextUrl.searchParams.set(providerId === "google" ? "pageToken" : "after_id", token);
    const next = await fetchCatalogue(nextUrl.href, headers);
    if (!next.ok) return next;
    catalogueBody = next.body;
    models.push(...readCatalogue(providerId, catalogueBody));
  }
  return {
    ok: true,
    models,
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    ...(detail ? { detail } : {}),
  };
}
