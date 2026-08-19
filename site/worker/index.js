// Cloudflare Worker entry point for the password-gated site.
//
// This replaces the earlier Express server (server/index.js, kept for local
// dev / non-Workers hosting — see site/README.md) because this project's
// Cloudflare deployment is a Workers Build, not a persistent Node process:
// there's no filesystem to read app/static from at request time and no
// in-memory store that survives across requests/isolates, so sessions here
// are a stateless HMAC-signed cookie instead of a server-side session map,
// gifs/lessons ship as bundled Worker assets, and lessons.json/gif_manifest
// are imported directly as JS modules rather than read from disk.
//
// Password hashing uses the Web Crypto PBKDF2 API instead of bcryptjs
// deliberately: this project's Cloudflare Workers Build runs no build/install
// command (deploy command is bare `wrangler versions upload`), so an npm
// dependency wouldn't be resolvable in node_modules at bundle time. PBKDF2
// via crypto.subtle is a runtime built-in — nothing to install.
import lessons from "../../app/lessons.json";
import gifManifest from "../../app/gif_manifest.json";

const SESSION_COOKIE = "gdt_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/login" && request.method === "POST") {
      return withSecurityHeaders(await handleLogin(request, env));
    }
    if (path === "/api/logout" && request.method === "POST") {
      return withSecurityHeaders(handleLogout(request));
    }

    const authed = await isAuthed(request, env);

    if (path === "/api/session") {
      return withSecurityHeaders(json({ authenticated: authed }));
    }

    if (path.startsWith("/api/")) {
      if (!authed) return withSecurityHeaders(json({ error: "Not authenticated." }, 401));
      if (path === "/api/lessons") return withSecurityHeaders(json(loadLessonsPayload(), 200, noStoreHeaders()));
      if (path === "/api/version") return withSecurityHeaders(json({ version: "site", frozen: false }, 200, noStoreHeaders()));
      if (path === "/api/changelog") return withSecurityHeaders(json(null, 200, noStoreHeaders()));
      return withSecurityHeaders(json({ error: "not found" }, 404));
    }

    if (path.startsWith("/portal")) {
      if (!authed) return withSecurityHeaders(redirect(new URL("/", request.url)));
      const resp = await env.ASSETS.fetch(request);
      return withSecurityHeaders(mergeHeaders(resp, noStoreHeaders()));
    }

    if (path === "/" && authed) {
      return withSecurityHeaders(redirect(new URL("/portal/", request.url)));
    }

    // Public login SPA + its JS/CSS/icon.
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};

async function handleLogin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad request." }, 400);
  }

  const hash = env.SITE_PASSWORD_HASH;
  if (!hash || !env.SESSION_SECRET) {
    return json({ error: "Server is not configured." }, 500);
  }

  let ok;
  try {
    ok = await verifyPassword(String(body?.password ?? ""), hash);
  } catch {
    // A malformed SITE_PASSWORD_HASH secret (bad encoding, or — as found
    // during setup — an iteration count above the 100,000 Workers' PBKDF2
    // implementation supports) would otherwise throw inside crypto.subtle
    // and crash the whole request with an opaque empty 500. Treat it as
    // "wrong password" instead of an unhandled exception.
    return json({ error: "Incorrect password." }, 401);
  }
  if (!ok) {
    return json({ error: "Incorrect password." }, 401);
  }

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = await signSession(expiresAt, env.SESSION_SECRET);
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly;${secureAttr(request)} SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  );
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

function handleLogout(request) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  headers.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly;${secureAttr(request)} SameSite=Strict; Max-Age=0`);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

// Real deployments always terminate TLS at Cloudflare's edge, so this is
// "Secure" everywhere in production — but `wrangler dev` serves plain HTTP
// locally, and a Secure cookie is silently refused by the browser (and by
// PowerShell's WebSession, which is how this got caught) over HTTP, which
// would otherwise make local testing look like a broken login.
function secureAttr(request) {
  return new URL(request.url).protocol === "https:" ? " Secure;" : "";
}

async function isAuthed(request, env) {
  if (!env.SESSION_SECRET) return false;
  const cookies = parseCookies(request.headers.get("Cookie"));
  return verifySession(cookies[SESSION_COOKIE], env.SESSION_SECRET);
}

function loadLessonsPayload() {
  return lessons.map((lesson) => {
    const gifs = gifManifest[lesson.id] || {};
    let idx = 0;
    const sections = lesson.sections.map((section) => ({
      ...section,
      bullet_gifs: section.bullets.map(() => gifs[String(idx++)] ?? null),
    }));
    return { ...lesson, sections };
  });
}

// --- Password hashing (PBKDF2-SHA256, no external dependency) -------------
// Hash format: "pbkdf2:<iterations>:<saltB64url>:<hashB64url>", produced by
// site/scripts/hash-password-worker.mjs.

async function verifyPassword(password, stored) {
  const parts = String(stored).split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  const salt = bytesFromB64url(parts[2]);
  const expected = bytesFromB64url(parts[3]);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const derived = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, expected.length * 8)
  );

  if (derived.length !== expected.length) return false;
  // Timing-safe comparison.
  let diff = 0;
  for (let i = 0; i < derived.length; i++) diff |= derived[i] ^ expected[i];
  return diff === 0;
}

// --- Stateless session cookie (HMAC-SHA256 over an expiry timestamp) ------
// No server-side session store: a Worker has no persistent memory shared
// across requests/regions, so the cookie itself carries the (signed,
// tamper-proof, time-limited) proof of authentication instead.

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signSession(expiresAt, secret) {
  const key = await hmacKey(secret);
  const payload = String(expiresAt);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${b64urlFromBytes(new Uint8Array(sig))}`;
}

async function verifySession(token, secret) {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  try {
    const key = await hmacKey(secret);
    return await crypto.subtle.verify("HMAC", key, bytesFromB64url(sig), new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

function b64urlFromBytes(bytes) {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromB64url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

// --- Response helpers -------------------------------------------------------

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

function redirect(url) {
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

function noStoreHeaders() {
  return { "Cache-Control": "no-store, no-cache, must-revalidate, private" };
}

function mergeHeaders(resp, extra) {
  const headers = new Headers(resp.headers);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
}

// Same rationale as documented in the (now local-dev-only) Express server:
// SAMEORIGIN + an explicit frame-src allowlist (not DENY / no-referrer) so
// the site can still frame its own color-wheel tool and YouTube can still
// see the embedding origin for its domain-restricted embed check.
function withSecurityHeaders(resp) {
  const headers = new Headers(resp.headers);
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'self'; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com;"
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
}
