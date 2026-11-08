export async function hashPassphrase(passphrase: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure passphrase hashing is unavailable in this browser.");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(passphrase));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
