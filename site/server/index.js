import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyPassword,
  createSession,
  destroySession,
  isValidSession,
  isRateLimited,
  recordAttempt,
  SESSION_COOKIE_NAME,
} from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(SITE_ROOT, "..");
const APP_DIR = path.join(REPO_ROOT, "app");
const APP_STATIC = path.join(APP_DIR, "static");
const PORTAL_OVERRIDES = path.join(SITE_ROOT, "portal-overrides");
const LOGIN_DIST = path.join(SITE_ROOT, "dist");

const PORT = Number(process.env.PORT || 8932);
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";
const SITE_PASSWORD_HASH = process.env.SITE_PASSWORD_HASH || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "";

if (!SITE_PASSWORD_HASH) {
  console.warn(
    "\n[WARN] SITE_PASSWORD_HASH is not set. Every login attempt will be rejected.\n" +
      '       Run: npm run hash-password -- "your password"  then put the result in site/.env\n'
  );
}
if (!SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET is not set. Add a long random string to site/.env before starting the server."
  );
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // needed on Render/Railway/Fly/etc. behind a proxy

app.use(cookieParser(SESSION_SECRET));
app.use(express.json({ limit: "8kb" }));

// Baseline hardening headers on every response.
//
// X-Frame-Options was previously DENY, which — applied globally — also
// blocked our OWN pages from being framed by our own pages: the color-wheel
// tool (both the standalone Tool tab and the Color Theory lesson's inline
// preview) is loaded in an <iframe> by portal-overrides/index.html /
// app/static/app.js, so a same-origin page refusing to be framed at all
// broke it outright. SAMEORIGIN + an explicit frame-ancestors/frame-src CSP
// keeps third parties from framing us while allowing that same-origin
// embedding and the YouTube lesson-video embeds to render.
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self'; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com;"
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  // "no-referrer" broke the YouTube lesson embeds: YouTube's domain-restricted
  // embedding check needs to see the embedding page's origin in the request
  // it makes for the iframe, and with no referrer sent at all it rejects the
  // embed with "Error 153 — Video player configuration error". This still
  // strips the referrer entirely on any downgrade to plain HTTP, and never
  // leaks the full URL path cross-origin — just the origin, which YouTube
  // (and any other embed) needs to identify us.
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
});

function isAuthed(req) {
  const token = req.signedCookies?.[SESSION_COOKIE_NAME];
  return isValidSession(token);
}

function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  return res.redirect("/");
}

// Never let the browser (or a shared cache) retain protected pages.
function noStore(req, res, next) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  next();
}

// --- Auth API -------------------------------------------------------------

app.post("/api/login", async (req, res) => {
  const ip = req.ip || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }

  const { password } = req.body || {};
  const ok = await verifyPassword(password, SITE_PASSWORD_HASH);
  if (!ok) {
    recordAttempt(ip);
    return res.status(401).json({ error: "Incorrect password." });
  }

  const { token, maxAgeMs } = createSession();
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "strict",
    signed: true,
    maxAge: maxAgeMs,
    path: "/",
  });
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  destroySession(req.signedCookies?.[SESSION_COOKIE_NAME]);
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/session", (req, res) => {
  res.json({ authenticated: isAuthed(req) });
});

// --- Protected lesson data (mirrors app/server.py's /api/* payloads) ------

function loadLessons() {
  const lessons = JSON.parse(fs.readFileSync(path.join(APP_DIR, "lessons.json"), "utf-8"));
  const manifestPath = path.join(APP_DIR, "gif_manifest.json");
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
    : {};
  for (const lesson of lessons) {
    const gifs = manifest[lesson.id] || {};
    let idx = 0;
    for (const section of lesson.sections) {
      section.bullet_gifs = [];
      for (const _ of section.bullets) {
        section.bullet_gifs.push(gifs[String(idx)] ?? null);
        idx += 1;
      }
    }
  }
  return lessons;
}

app.get("/api/lessons", requireAuth, noStore, (req, res) => {
  res.json(loadLessons());
});

app.get("/api/version", requireAuth, noStore, (req, res) => {
  res.json({ version: "site", frozen: false });
});

app.get("/api/changelog", requireAuth, noStore, (req, res) => {
  res.json(null);
});

// --- Protected portal (reskinned lesson viewer, same data/gifs as the app) -

app.use(
  "/portal",
  requireAuth,
  noStore,
  express.static(PORTAL_OVERRIDES, { index: "index.html" }),
  express.static(APP_STATIC, { index: "index.html" })
);

// --- Public login SPA -------------------------------------------------------

app.use(express.static(LOGIN_DIST, { index: "index.html" }));
app.use(express.static(path.join(SITE_ROOT, "public")));

app.get("/", (req, res, next) => {
  if (isAuthed(req)) return res.redirect("/portal/");
  next();
});

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "not found" });
  res.sendFile(path.join(LOGIN_DIST, "index.html"), (err) => {
    if (err) res.status(404).send("Not found. Did you run `npm run build`?");
  });
});

app.listen(PORT, () => {
  console.log(`graphic design tips — site running at http://127.0.0.1:${PORT}`);
});
