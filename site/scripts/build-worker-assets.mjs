// Consolidates everything the Cloudflare Worker serves as static assets
// (site/worker-assets/) into one directory tree, since Workers Static
// Assets binds to a single directory:
//   /              -> the built login SPA (site/dist)
//   /icon.png      -> shown on the login card
//   /portal/       -> portal-overrides/ layered on top of app/static
//                     (same relationship as the two chained express.static
//                     calls in the local-dev server: overrides win)
//
// Run after `npm run build` (which produces site/dist). The Cloudflare
// Workers Build for this project runs no build command, so this output has
// to be committed to the repo rather than generated at deploy time.
import { existsSync, mkdirSync, cpSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(SITE_ROOT, "..");

const DIST = path.join(SITE_ROOT, "dist");
const PUBLIC = path.join(SITE_ROOT, "public");
const PORTAL_OVERRIDES = path.join(SITE_ROOT, "portal-overrides");
const APP_STATIC = path.join(REPO_ROOT, "app", "static");
const OUT = path.join(SITE_ROOT, "worker-assets");

if (!existsSync(DIST)) {
  console.error("site/dist not found — run `npm run build` first.");
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Login SPA
cpSync(DIST, OUT, { recursive: true });
cpSync(PUBLIC, OUT, { recursive: true });

// Portal: app's real static assets (gifs, app.js, style.css, color wheel
// tool, everything) first, then the site's overrides on top so
// portal-overrides/index.html and site-theme.css win.
const portalOut = path.join(OUT, "portal");
mkdirSync(portalOut, { recursive: true });
cpSync(APP_STATIC, portalOut, { recursive: true });
cpSync(PORTAL_OVERRIDES, portalOut, { recursive: true });

console.log(`Built worker assets at ${path.relative(REPO_ROOT, OUT)}`);
