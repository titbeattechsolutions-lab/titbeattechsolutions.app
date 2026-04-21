// PIN hashing utilities using PBKDF2 (Web Crypto API)
// Format: "pbkdf2$<iterations>$<saltHex>$<hashHex>"
// Backward-compatible with legacy SHA-256 hashes (hex string, no $) and plain numeric PINs.

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

// Legacy salt — kept ONLY so we can verify existing SHA-256 hashes during migration.
const LEGACY_SALT = "schoolapp_v1_salt_2024";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function pbkdf2(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  // Copy into a fresh ArrayBuffer-backed Uint8Array to satisfy strict BufferSource typing.
  const saltBuf = new Uint8Array(salt.length);
  saltBuf.set(salt);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuf, iterations },
    keyMaterial,
    HASH_BITS
  );
  return bytesToHex(new Uint8Array(bits));
}

/** Hash a PIN using PBKDF2 with a fresh random salt. Returns "pbkdf2$iter$saltHex$hashHex". */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(pin, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${hash}`;
}

/** Legacy SHA-256 with static salt — used for verifying old hashes only. */
async function legacySha256(pin: string): Promise<string> {
  const data = new TextEncoder().encode(LEGACY_SALT + pin);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(buf));
}

/** Verify a PIN against any supported hash format (PBKDF2, legacy SHA-256, or plain). */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  // Plain-text legacy PIN (very old)
  if (stored.length <= 8 && /^\d+$/.test(stored)) {
    return pin === stored;
  }
  // New PBKDF2 format
  if (stored.startsWith("pbkdf2$")) {
    const [, iterStr, saltHex, hashHex] = stored.split("$");
    const iterations = parseInt(iterStr, 10);
    const salt = hexToBytes(saltHex);
    const candidate = await pbkdf2(pin, salt, iterations);
    return candidate === hashHex;
  }
  // Legacy SHA-256 hex (64 chars)
  const legacy = await legacySha256(pin);
  return legacy === stored;
}
