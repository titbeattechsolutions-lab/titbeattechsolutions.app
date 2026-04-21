// PIN verification helpers.
// Hashing is done SERVER-SIDE with bcrypt (via pgcrypto) inside SECURITY DEFINER RPCs.
// The client only sends the plain PIN over HTTPS — never hashes it.
// This file is kept for backward compatibility with any caller still importing hashPin/verifyPin.

const LEGACY_SALT = "schoolapp_v1_salt_2024";

/** @deprecated Server now hashes with bcrypt. Kept only for offline tools/tests. */
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(LEGACY_SALT + pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** @deprecated PIN verification is now server-side. */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  if (stored.length <= 8 && /^\d+$/.test(stored)) return pin === stored;
  return (await hashPin(pin)) === stored;
}
