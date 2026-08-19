// Generates the PBKDF2 password hash the Cloudflare Worker expects in its
// SITE_PASSWORD_HASH secret (see site/worker/index.js). Uses the same
// Web Crypto PBKDF2 API the Worker verifies against, via Node's built-in
// webcrypto — no dependency needed here either.
//
//   node scripts/hash-password-worker.mjs "your password"
//
// Then set the printed value as a secret on the Worker — do NOT put it in
// wrangler.jsonc or any committed file:
//   npx wrangler secret put SITE_PASSWORD_HASH --config ../wrangler.jsonc
// (paste the value when prompted), or add it via the Cloudflare dashboard:
// Workers & Pages > graphic-design-app > Settings > Variables and Secrets.
import { webcrypto as crypto } from "node:crypto";

const ITERATIONS = 210000; // OWASP-recommended minimum for PBKDF2-HMAC-SHA256

function b64url(bytes) {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return Buffer.from(str, "binary").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error('Usage: node scripts/hash-password-worker.mjs "your password"');
    process.exit(1);
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const derived = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, key, 256)
  );

  const hash = `pbkdf2:${ITERATIONS}:${b64url(salt)}:${b64url(derived)}`;
  console.log("\nSITE_PASSWORD_HASH (set as a Worker secret, never commit this):\n");
  console.log(hash);
  console.log();
}

main();
