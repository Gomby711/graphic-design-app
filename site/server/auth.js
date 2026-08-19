import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const SESSION_COOKIE = "gdt_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// In-memory session + rate-limit stores. The password hash itself lives only
// in process.env (never sent to the client, never logged, never rendered
// into any HTML/JS the browser receives) — this module is the only place
// that ever compares a submitted password against it.
const sessions = new Map(); // token -> expiresAt
const attempts = new Map(); // ip -> { count, resetAt }

function pruneSessions() {
  const now = Date.now();
  for (const [token, expiresAt] of sessions) {
    if (expiresAt < now) sessions.delete(token);
  }
}

export function isRateLimited(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || rec.resetAt < now) {
    attempts.set(ip, { count: 0, resetAt: now + ATTEMPT_WINDOW_MS });
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}

export function recordAttempt(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, resetAt: now + ATTEMPT_WINDOW_MS };
  rec.count += 1;
  attempts.set(ip, rec);
}

export async function verifyPassword(password, hash) {
  if (!hash) return false;
  // bcrypt.compare is already timing-safe with respect to the hash contents.
  return bcrypt.compare(String(password ?? ""), hash);
}

export function createSession() {
  pruneSessions();
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return { token, maxAgeMs: SESSION_TTL_MS };
}

export function destroySession(token) {
  if (token) sessions.delete(token);
}

export function isValidSession(token) {
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
