const SESSION_COOKIE_NAME = "__Host-grizzly_session";
const SESSION_TOKEN_BYTE_LENGTH = 32;
const MAX_IDENTITY_HASH_LENGTH = 2_048;
const MAX_IDENTITY_ITERATIONS = 500_000;

const encoder = new TextEncoder();

export function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTE_LENGTH));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader || cookieHeader.length > 8_192) return null;

  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== SESSION_COOKIE_NAME) continue;

    const value = cookie.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  }

  return null;
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAgeSeconds}; Secure; HttpOnly; SameSite=Lax`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin || origin === "null") return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function readUInt32BigEndian(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function fixedTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;

  if ("timingSafeEqual" in crypto.subtle && typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(left, right);
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function derivePasswordSubkey(
  password: string,
  salt: Uint8Array,
  iterations: number,
  hash: "SHA-1" | "SHA-256" | "SHA-512",
  subkeyLength: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash, salt, iterations },
    key,
    subkeyLength * 8,
  );
  return new Uint8Array(bits);
}

/** Verifies the Identity V2/V3 PBKDF2 hash formats used by the existing ASP.NET API. */
export async function verifyAspNetIdentityPassword(password: string, encodedHash: string): Promise<boolean> {
  if (!password || !encodedHash || encodedHash.length > MAX_IDENTITY_HASH_LENGTH) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encodedHash) || encodedHash.length % 4 !== 0) return false;

  try {
    const binary = atob(encodedHash);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.length === 0) return false;

    let salt: Uint8Array;
    let expectedSubkey: Uint8Array;
    let iterations: number;
    let hash: "SHA-1" | "SHA-256" | "SHA-512";

    if (bytes[0] === 0) {
      // ASP.NET Identity V2: marker, 16-byte salt, 32-byte HMAC-SHA1 subkey.
      if (bytes.length !== 49) return false;
      salt = bytes.subarray(1, 17);
      expectedSubkey = bytes.subarray(17);
      iterations = 1_000;
      hash = "SHA-1";
    } else if (bytes[0] === 1) {
      // ASP.NET Identity V3 stores PRF, iteration count, and salt length as big-endian UInt32s.
      if (bytes.length < 45) return false;
      const prf = readUInt32BigEndian(bytes, 1);
      iterations = readUInt32BigEndian(bytes, 5);
      const saltLength = readUInt32BigEndian(bytes, 9);
      const hashAlgorithm = prf === 0 ? "SHA-1" : prf === 1 ? "SHA-256" : prf === 2 ? "SHA-512" : null;

      if (hashAlgorithm === null || iterations < 1 || iterations > MAX_IDENTITY_ITERATIONS) return false;
      if (saltLength < 16 || saltLength > 1_024 || 13 + saltLength + 16 > bytes.length) return false;

      hash = hashAlgorithm;
      salt = bytes.subarray(13, 13 + saltLength);
      expectedSubkey = bytes.subarray(13 + saltLength);
    } else {
      return false;
    }

    const actualSubkey = await derivePasswordSubkey(
      password,
      salt,
      iterations,
      hash,
      expectedSubkey.length,
    );
    return fixedTimeEqual(actualSubkey, expectedSubkey);
  } catch {
    return false;
  }
}
