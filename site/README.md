# graphic design tips — site

A password-gated web version of the Graphic Design Tips app. Same lessons,
same gifs, same functionality as the desktop/browser app in `app/` — just
reachable as a website, wrapped behind a login, and reskinned with a
minimalist/artistic palette so the site and the app are visually distinct.

```
site/
  src/                 login SPA (React + TypeScript + Tailwind + shadcn-style components)
    components/ui/     web-gl-shader.tsx, liquid-glass-button.tsx (shadcn "copy-paste" components)
    components/PasswordGate.tsx
  worker/index.js      Cloudflare Worker — production. The only place the password is ever checked.
  server/              Express server — local dev only (see "Two ways to run this" below)
  portal-overrides/    reskin layer (index.html + site-theme.css) laid over app/static
  public/              icon.png shown on the login card
  scripts/             build-worker-assets.mjs, hash-password-worker.mjs
  worker-assets/       generated + committed — what the Worker actually serves (see below)
```

## Two ways to run this

This project is deployed on **Cloudflare Workers** (`wrangler.jsonc` at the
repo root, deploy command `npx wrangler versions upload`, auto-triggered by
Cloudflare Workers Builds on every push to `main`). A Worker is not a
persistent Node process — no filesystem to read `app/static` from at request
time, no in-memory store that survives across requests — so `site/worker/index.js`
is a from-scratch implementation for that runtime: sessions are a stateless
HMAC-signed cookie instead of a server-side session map, the password hash
check uses Web Crypto PBKDF2 instead of bcrypt (the Cloudflare Workers Build
for this project runs no `npm install` step, so a Worker script can't depend
on an npm package — PBKDF2 via `crypto.subtle` is a runtime built-in, nothing
to resolve from `node_modules`), and every static file it serves (gifs,
`app.js`, the color-wheel tool, the built login SPA) has to already exist as
files in `site/worker-assets/` — Workers Static Assets bind to one directory,
and there's no build step in the deploy pipeline to generate that directory
on Cloudflare's side.

`site/server/` (Express, `server/index.js`) is kept as a **local-dev-only**
alternative — simpler to iterate on with `npm run dev`/`npm start`, and
usable as a real deployment target too if you ever move off Workers to a
persistent Node host (see "Deploying" below). It is not what's live in
production; don't rely on the two staying behaviour-identical for anything
beyond the core lesson-viewing flow.

### Regenerating `site/worker-assets/`

Whenever `app/static` (gifs, lessons content) or the login SPA (`site/src`)
changes, rebuild and re-commit the asset tree:

```bash
cd site
npm run build               # login SPA -> dist/
npm run build:worker-assets # consolidates dist/ + portal-overrides/ + app/static -> worker-assets/
```

`worker-assets/` roughly doubles the repo's size (it's a full copy of
`app/static/gifs`, ~1GB) — that's the tradeoff for a git-push-to-deploy
pipeline with no build step on Cloudflare's side. If that becomes a problem,
the fix is enabling a real build command in the Cloudflare dashboard
(Settings → Build configuration: `cd site && npm install && npm run build && npm run build:worker-assets`,
deploy command `npx wrangler deploy --config ../wrangler.jsonc`) so the
directory is generated at deploy time instead of committed — ask before
anyone changes that, since it's a change to shared account configuration.

## How it works

1. **`GET /`** serves the login SPA (built from `src/`). It shows the app
   icon, a WebGL shader background, and a password field in a liquid-glass
   card.
2. **`POST /api/login`** is the *only* place the password is checked. The
   server holds a bcrypt hash (`SITE_PASSWORD_HASH`, set in `.env`, never
   committed) and compares it with `bcrypt.compare`. On success it mints a
   random session token, stores it server-side, and sets it as an
   `httpOnly`, `Secure`, `SameSite=Strict`, signed cookie. The browser never
   receives the password or the hash — not in the HTML, not in the JS
   bundle, not in a network response, not in a source map. Someone reading
   every byte the browser downloads still cannot recover the password.
3. **`/portal/*`** (the actual lesson viewer) and **`/api/lessons`**,
   `/api/version`, `/api/changelog` all sit behind `requireAuth` middleware
   that checks the session cookie server-side. Unauthenticated requests get
   redirected to `/` (or `401` for API calls) — there is no client-side-only
   gate to bypass with devtools.
4. `/portal` is `app/static` (the exact same HTML/JS/data the desktop app
   uses — `app/lessons.json`, `app/gif_manifest.json`, every gif under
   `app/static/gifs/`) with `portal-overrides/` laid on top: an `index.html`
   that adds a "Sign out" button and loads one extra stylesheet,
   `site-theme.css`, which **only redefines the app's existing CSS custom
   properties** (`--bg`, `--panel`, `--accent-2`, the `--splash-*` colors,
   etc.). Every rule in the app's `style.css` already reads from those
   variables, so the whole viewer retints to the site's palette — layout,
   interactions, and lesson content stay byte-for-byte identical to the app.

## Security measures

- Password is **never** sent to or stored in the client. The Worker holds a
  PBKDF2 hash (100,000 iterations, SHA-256 — the max Cloudflare Workers'
  PBKDF2 implementation supports; higher throws at verify time) in a
  Cloudflare secret; the
  Express dev server holds a bcrypt hash (cost 12) in `.env`. Either way it
  never leaves the server.
- Sessions are `httpOnly` + `Secure` (on real HTTPS requests) +
  `SameSite=Strict` **signed** cookies — JavaScript on the page cannot read
  them, and they can't be forged without the server's `SESSION_SECRET`. The
  Worker's cookie is a stateless signed timestamp (no server-side session
  store — a Worker has none); the Express server keeps a matching
  server-side session map.
- All protected responses are sent with `Cache-Control: no-store` so
  browsers/proxies never cache lesson content or the session state to disk.
- Hardening headers on every response: `X-Frame-Options: SAMEORIGIN`,
  a `Content-Security-Policy` scoping `frame-src`/`frame-ancestors` to same
  origin plus YouTube, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`. (Earlier versions used
  `DENY` and `no-referrer`, which broke the site's own same-origin
  color-wheel-tool iframe and the YouTube lesson embeds respectively —
  fixed; see git history if you're curious why.)
- Real secrets never touch source control: the Worker's `SITE_PASSWORD_HASH`
  / `SESSION_SECRET` are Cloudflare secrets (dashboard or `wrangler secret
  put`, never `wrangler.jsonc`); the Express server's equivalents live in a
  git-ignored `.env` (only `.env.example`, with empty placeholders, is
  committed). No developer reading this repository, or any fork of it, can
  recover the password from source.
- Sessions expire after 12 hours; "Sign out" clears the cookie (and, for the
  Express server, destroys the server-side session) immediately.
- The Worker has no per-IP rate limiting — a Worker has no reliable shared
  memory across the isolates/regions a request might land on, so an
  in-process counter (which the Express server does have) wouldn't actually
  work there. Add a Cloudflare **Rate Limiting Rule** on `/api/login` in the
  dashboard (Security → WAF → Rate limiting rules) instead — it enforces
  centrally at the edge, which is a better fit than application code here.

## Cloudflare Worker setup (production)

This is what's actually deployed. Requires the `wrangler` CLI (installed as
a `site/` devDependency) and a Cloudflare account with the Worker already
connected to this repo (Workers Builds auto-deploys `main` on every push).

```bash
cd site
npm install
npm run hash-password:worker -- "Boston5940!"   # prints the PBKDF2 hash
```

Set the two secrets the Worker needs — **paste the value in yourself**, not
via a request to an AI assistant, same as any other credential:

```bash
npx wrangler secret put SITE_PASSWORD_HASH --config ../wrangler.jsonc
npx wrangler secret put SESSION_SECRET --config ../wrangler.jsonc
# SESSION_SECRET can be any long random string, e.g.:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

(Or set them in the dashboard: Workers & Pages → graphic-design-app →
Settings → Variables and Secrets — mark both as **Secret**, not plain text.)

Then regenerate and commit `site/worker-assets/` (see "Regenerating
worker-assets" above) and push to `main` — Workers Builds picks it up from
there. To test the exact Worker locally first:

```bash
npm run worker:dev   # wrangler dev — real Worker runtime, not Express
```

## Local dev (Express, optional)

Requires Node 18+.

```bash
cd site
npm install

# Generate the password hash (does NOT print/store the plaintext anywhere
# except your terminal history — clear it if that matters to you):
npm run hash-password -- "Boston5940!"

cp .env.example .env
# paste the printed SITE_PASSWORD_HASH into .env
# add a SESSION_SECRET, e.g.:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

npm run build   # builds the login SPA into dist/
npm start       # serves the site on http://127.0.0.1:8932
```

Set `COOKIE_SECURE=true` in `.env` once the site is deployed behind HTTPS
(required in production — browsers refuse to send `Secure` cookies over
plain HTTP, which is correct behavior).

## About the shadcn / Tailwind / TypeScript setup

The rest of the repository (`app/`) is a plain Python + vanilla JS project —
it has no React, Tailwind, or TypeScript toolchain, so there was no existing
`components/ui` folder to drop shadcn components into. `site/` is a fresh,
self-contained Vite + React + TypeScript + Tailwind project set up to match
shadcn's conventions instead:

- `src/components/ui/` is the default shadcn component path — components
  copy-pasted from shadcn or shadcn-style registries go here unmodified,
  which keeps them upgradeable by re-pasting rather than needing patches.
- `src/lib/utils.ts` exports the `cn()` helper (`clsx` + `tailwind-merge`)
  that every shadcn component expects to import from `@/lib/utils`.
- `tailwind.config.ts` + `postcss.config.js` wire up Tailwind; `tsconfig.json`
  declares the `@/*` path alias shadcn components rely on.

If you ever want the *full* shadcn CLI experience (component registry,
`components.json`, auto-wired themes) instead of hand-rolled config, run
this from inside `site/` on a scaffolded Vite React+TS project:

```bash
npm create vite@latest . -- --template react-ts
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
npx shadcn@latest init
npx shadcn@latest add button
```

`npx shadcn@latest init` is what creates `components.json` and confirms/
creates the `/components/ui` path. Keeping components under that exact path
matters even outside the CLI: it's what every shadcn registry, block, and
third-party shadcn-style component assumes when it writes an import like
`@/components/ui/button` — put components anywhere else and every copy-paste
snippet from the ecosystem needs a manual import fix.

## Deploying

**Production is Cloudflare Workers** — see "Cloudflare Worker setup" above.
It's git-push-to-deploy already: push to `main` and Workers Builds deploys
`site/worker/index.js` + `site/worker-assets/` automatically. The only
manual steps are setting the two secrets (once) and regenerating
`worker-assets/` when content changes.

If you ever want to run the Express server (`site/server/`) as the real
deployment instead of the Worker — e.g. moving off Workers entirely — it's a
small always-on Node process and needs a host that runs Node, not a static
host like GitHub Pages. Free tiers that work: **Render** (free web service),
**Fly.io** (free allowance), or **Railway** (free trial credit). Point the
build at `site/`, build command `npm install && npm run build`, start
command `npm start`, and set `SITE_PASSWORD_HASH`, `SESSION_SECRET`,
`COOKIE_SECURE=true` as environment variables in the host's dashboard
(never in a committed file). Deploy the whole repo (or at least `app/` +
`site/`) together — the Express server reads `../app/lessons.json`,
`../app/gif_manifest.json`, and `../app/static/gifs` relative to `site/`.
