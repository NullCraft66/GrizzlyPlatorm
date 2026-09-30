type Row = Record<string, unknown>;

interface NexusSettingsRow extends Row {
  apiKeyCiphertext: string;
  apiKeyIv: string;
  eventKey: string;
  enabled: number | boolean;
}

const NEXUS_API_BASE = "https://frc.nexus/api/v1/";
const NEXUS_SETTINGS_AAD = new TextEncoder().encode("GrizzlyPlatform.NexusSettings.v1");
const NEXUS_TIMEOUT_MS = 8_000;

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function text(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getEncryptionKey(env: Env): Promise<CryptoKey> {
  const secret = env.NEXUS_SETTINGS_ENCRYPTION_KEY?.trim();
  if (!secret) throw new Error("Nexus settings encryption secret is not configured.");

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(secret);
  } catch {
    throw new Error("Nexus settings encryption secret must be base64-encoded 32-byte key material.");
  }
  if (bytes.byteLength !== 32) {
    throw new Error("Nexus settings encryption secret must decode to exactly 32 bytes.");
  }

  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptApiKey(apiKey: string, env: Env): Promise<{ ciphertext: string; iv: string }> {
  const key = await getEncryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: NEXUS_SETTINGS_AAD },
    key,
    new TextEncoder().encode(apiKey),
  );
  return { ciphertext: encodeBase64(new Uint8Array(ciphertext)), iv: encodeBase64(iv) };
}

async function decryptApiKey(row: NexusSettingsRow, env: Env): Promise<string> {
  if (!row.apiKeyCiphertext || !row.apiKeyIv) return "";
  const key = await getEncryptionKey(env);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decodeBase64(row.apiKeyIv),
      additionalData: NEXUS_SETTINGS_AAD,
    },
    key,
    decodeBase64(row.apiKeyCiphertext),
  );
  return new TextDecoder().decode(plaintext);
}

async function readSettings(db: D1Database): Promise<NexusSettingsRow> {
  const row = await db.prepare(`SELECT ApiKeyCiphertext AS apiKeyCiphertext,
      ApiKeyIv AS apiKeyIv, EventKey AS eventKey, Enabled AS enabled
    FROM NexusSettings WHERE Id = 1`).first<NexusSettingsRow>();
  return {
    apiKeyCiphertext: typeof row?.apiKeyCiphertext === "string" ? row.apiKeyCiphertext : "",
    apiKeyIv: typeof row?.apiKeyIv === "string" ? row.apiKeyIv : "",
    eventKey: typeof row?.eventKey === "string" ? row.eventKey : "",
    enabled: row?.enabled === true || row?.enabled === 1,
  };
}

function publicSettings(settings: NexusSettingsRow): Record<string, unknown> {
  return {
    eventKey: settings.eventKey,
    enabled: settings.enabled === true || settings.enabled === 1,
    configured: Boolean(settings.apiKeyCiphertext && settings.apiKeyIv),
  };
}

async function getApiKey(db: D1Database, env: Env): Promise<string> {
  const settings = await readSettings(db);
  return decryptApiKey(settings, env);
}

async function callNexus(env: Env, apiKey: string, path: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("Nexus request timed out"), NEXUS_TIMEOUT_MS);
  try {
    const response = await fetch(new URL(path, NEXUS_API_BASE), {
      headers: { "Nexus-Api-Key": apiKey, Accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Nexus returned HTTP ${response.status}.`);
    return await response.json() as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function upstreamError(error: unknown): Response {
  const timedOut = error instanceof Error && error.name === "AbortError";
  return json({
    message: timedOut ? "Nexus did not respond in time." : "Nexus request failed.",
    error: { code: timedOut ? "nexus_timeout" : "nexus_upstream_error" },
  }, 502);
}

export async function getNexusStatus(db: D1Database): Promise<Response> {
  const settings = await readSettings(db);
  return json({ configured: Boolean(settings.apiKeyCiphertext && settings.apiKeyIv) });
}

export async function getNexusSettings(db: D1Database): Promise<Response> {
  return json(publicSettings(await readSettings(db)));
}

export async function saveNexusSettings(request: Request, db: D1Database, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return text("A valid Nexus settings request is required.", 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return text("A valid Nexus settings request is required.", 400);
  }

  const apiKey = Object.prototype.hasOwnProperty.call(body, "apiKey") ? body.apiKey : body.ApiKey;
  const eventKey = Object.prototype.hasOwnProperty.call(body, "eventKey") ? body.eventKey : body.EventKey;
  const enabled = Object.prototype.hasOwnProperty.call(body, "enabled") ? body.enabled : body.Enabled;
  if (typeof apiKey !== "string" || typeof eventKey !== "string" || typeof enabled !== "boolean"
      || apiKey.length > 500 || eventKey.length > 80) {
    return text("A valid Nexus API key, event key, and enabled value are required.", 400);
  }

  const current = await readSettings(db);
  let encrypted = { ciphertext: current.apiKeyCiphertext, iv: current.apiKeyIv };
  if (apiKey.trim()) {
    try {
      encrypted = await encryptApiKey(apiKey.trim(), env);
    } catch {
      return json({ message: "Nexus settings cannot be saved until the Worker encryption secret is configured correctly." }, 503);
    }
  }

  const trimmedEventKey = eventKey.trim();
  await db.prepare(`INSERT INTO NexusSettings
      (Id, ApiKeyCiphertext, ApiKeyIv, EventKey, Enabled, UpdatedAt)
    VALUES (1, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(Id) DO UPDATE SET
      ApiKeyCiphertext = excluded.ApiKeyCiphertext,
      ApiKeyIv = excluded.ApiKeyIv,
      EventKey = excluded.EventKey,
      Enabled = excluded.Enabled,
      UpdatedAt = excluded.UpdatedAt`)
    .bind(encrypted.ciphertext, encrypted.iv, trimmedEventKey, enabled ? 1 : 0)
    .run();

  return json({ eventKey: trimmedEventKey, enabled, configured: Boolean(encrypted.ciphertext && encrypted.iv) });
}

export async function getNexusEvents(db: D1Database, env: Env): Promise<Response> {
  let apiKey: string;
  try {
    apiKey = await getApiKey(db, env);
  } catch {
    return json({ message: "Nexus settings cannot be decrypted. Check the Worker encryption secret." }, 503);
  }
  if (!apiKey) return text("Configure a Nexus API key first.", 400);
  try {
    const events = await callNexus(env, apiKey, "events");
    return events === null ? new Response(null, { status: 404 }) : json(events);
  } catch (error) {
    return upstreamError(error);
  }
}

export async function getNexusEventData(
  db: D1Database,
  env: Env,
  eventKey: string,
  resource: "event" | "pits" | "map",
): Promise<Response> {
  if (!eventKey || eventKey.length > 80) return text("Invalid Nexus event key.", 400);
  let apiKey: string;
  try {
    apiKey = await getApiKey(db, env);
  } catch {
    return json({ message: "Nexus settings cannot be decrypted. Check the Worker encryption secret." }, 503);
  }
  if (!apiKey) return json({ message: "Nexus is not configured." }, 503);

  const path = resource === "event"
    ? `event/${encodeURIComponent(eventKey)}`
    : `event/${encodeURIComponent(eventKey)}/${resource}`;
  try {
    const data = await callNexus(env, apiKey, path);
    if (data !== null) return json(data);
    return resource === "pits"
      ? json({ available: false, pits: {} })
      : json({ message: "Nexus event data was not found." }, 503);
  } catch (error) {
    if (resource === "pits" && error instanceof Error && error.name !== "AbortError") {
      return json({ available: false, pits: {} });
    }
    return upstreamError(error);
  }
}

export async function getNexusSnapshot(db: D1Database, env: Env): Promise<Response> {
  const settings = await readSettings(db);
  const eventKey = settings.eventKey;
  if (!settings.enabled || !eventKey || !(settings.apiKeyCiphertext && settings.apiKeyIv)) {
    return json({ eventKey, connected: false, matches: [], pits: {}, map: {} });
  }

  let apiKey: string;
  try {
    apiKey = await getApiKey(db, env);
  } catch {
    return json({ message: "Nexus settings cannot be decrypted. Check the Worker encryption secret." }, 503);
  }
  try {
    const [eventResult, pitsResult, mapResult] = await Promise.allSettled([
      callNexus(env, apiKey, `event/${encodeURIComponent(eventKey)}`),
      callNexus(env, apiKey, `event/${encodeURIComponent(eventKey)}/pits`),
      callNexus(env, apiKey, `event/${encodeURIComponent(eventKey)}/map`),
    ]);
    if (eventResult.status === "rejected") return upstreamError(eventResult.reason);
    const status = eventResult.value && typeof eventResult.value === "object" && !Array.isArray(eventResult.value)
      ? eventResult.value as Record<string, unknown>
      : {};
    const matches = Array.isArray(status.matches) ? status.matches : [];
    const pits = pitsResult.status === "fulfilled" && pitsResult.value !== null
      ? pitsResult.value
      : {};
    const map = mapResult.status === "fulfilled" && mapResult.value !== null
      ? mapResult.value
      : {};
    return json({
      eventKey,
      connected: eventResult.value !== null,
      refreshedAt: new Date().toISOString(),
      status,
      matches,
      pits,
      map,
    });
  } catch (error) {
    return upstreamError(error);
  }
}
