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
  server/              Express server — the only place the password is ever checked
  portal-overrides/    reskin layer (index.html + site-theme.css) laid over app/static
  public/              icon.png shown on the login card
```

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

- Password is **never** sent to or stored in the client. Only a bcrypt hash
  (cost factor 12) lives on the server, in an environment variable.
- Session tokens are 256-bit random values kept in server memory and
  referenced by an `httpOnly` + `Secure` + `SameSite=Strict` **signed**
  cookie — JavaScript on the page cannot read it, and it can't be forged
  without the server's `SESSION_SECRET`.
- Login attempts are rate-limited per IP (8 attempts / 10 minutes) to make
  brute-forcing impractical.
- All protected responses are sent with `Cache-Control: no-store` so
  browsers/proxies never cache lesson content or the session state to disk.
- Baseline hardening headers (`X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`) are set
  on every response.
- `.env` (real password hash + session secret) is git-ignored; only
  `.env.example` (empty placeholders) is committed. No developer reading
  the repository — this one or anyone else's fork — can recover the
  password from source.
- Sessions expire after 12 hours; "Sign out" clears the cookie and destroys
  the server-side session immediately.

## Setup

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

## Deploying (free)

This is a small always-on Node process (it needs the server to keep the
password check off the client), not a static site, so it needs a host that
runs Node — not a plain static host like GitHub Pages. Free tiers that work:

- **Render** (free web service) or **Fly.io** (free allowance) or
  **Railway** (free trial credit): point the build at `site/`, build
  command `npm install && npm run build`, start command `npm start`, and
  set `SITE_PASSWORD_HASH`, `SESSION_SECRET`, `COOKIE_SECURE=true` as
  environment variables in the host's dashboard (never in a committed file).
- Point your gifs/lessons: the server reads `../app/lessons.json`,
  `../app/gif_manifest.json`, and `../app/static/gifs` relative to `site/`,
  so deploy the whole repo (or at least `app/` + `site/`) together.
