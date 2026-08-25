import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Explicit extension: this file is typechecked under the node16 resolution of
// tsconfig.node.json, unlike src/ — same reason scripts/bakeIconFont.ts spells
// its imports out. `npm run typecheck` covers only the app project, so this
// one is caught by `tsc -b` in the build.
import { precacheConfig } from './src/pwa/swConfig.ts'

// Dev-server HTTPS (mkcert-signed, LAN-trusted once its CA is installed on a
// tablet — see apps/web's README/CLAUDE.md) — needed for AudioWorklet (pencil
// sound Variant 3, #153), which browsers refuse to load on a plain-http LAN
// origin (only "potentially trustworthy" origins — https or literal
// localhost — qualify). The API/Socket.io backend (apps/server, plain http)
// is reverse-proxied through this same origin below rather than given its
// own cert, so an https page never makes a direct http:// request (that's
// "mixed content" and gets blocked regardless of CORS) — see lib/api.ts and
// Room/index.tsx's socket connection, both same-origin/relative regardless
// of which mode is active here.
//
// On by default; run `npm run dev:http` (`vite --host --mode http`) for
// plain http instead — e.g. quick localhost work where the AudioWorklet
// path isn't needed and you'd rather skip mkcert's cert prompts.
// Where `/api` and `/socket.io` are proxied. Overridable for the same reason
// the server's own PORT is: two checkouts running side by side (a worktree
// under review next to the live dev server) need two ports, not a queue.
const SERVER_PORT = Number(process.env.SERVER_PORT ?? 4000)

// (#177) Source-map upload. Without it a production stack trace is a column
// number inside a minified chunk, which is the same as having no stack trace
// — the whole reason for wiring Sentry up is to read the frame that broke.
//
// Only runs where the auth token exists, i.e. in CI (deploy.yml); a local
// `npm run build` neither uploads nor emits maps. `sourcemap: 'hidden'` plus
// `filesToDeleteAfterUpload` is what keeps the maps out of the deployed
// bundle: they are generated, uploaded to Sentry, and deleted before the
// dist/ directory is rsynced to the VPS — no `//# sourceMappingURL` comment
// pointing at a file we would rather not publish, and nothing left on disk
// for anyone to fetch. Matching of maps to code is by debug ID injected into
// both, not by release name, so this works regardless of what the release is
// called.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN

// (#48, #502) Service worker. The whole point is the cold start with no network
// — inside an already-loaded app offline was handled in #201/#313, but opening
// the URL or launching from the home screen without a connection still hit the
// browser's own "no internet" page, because nothing of ours ever ran.
//
// The worker is written by hand in src/pwa/sw.ts rather than generated, and
// #502 is why: `generateSW` answers navigations out of its own precache, so a
// tab opened after a deploy boots the *previous* build for as long as any older
// tab is still holding the old worker active. That cannot be configured away —
// a network-first navigation with a precache fallback is not expressible in
// `generateSW` (a NetworkFirst route that fails throws instead of falling
// through to the navigation fallback, which would cost the offline cold start
// above). See sw.ts's header for the full mechanism.
//
// What it caches lives in src/pwa/swConfig.ts, next to the test that asserts
// it — the precache-size trap is silent on a developer's wifi, so it needs a
// check that runs without a build. The settings kept here are the ones about
// registration rather than caching.
const pwa = VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src/pwa',
  // A `.ts` source; the plugin builds it and writes dist/sw.js, so the
  // registered URL is unchanged.
  filename: 'sw.ts',
  injectManifest: precacheConfig,
  // Not `autoUpdate`, which is skipWaiting + an unconditional reload. This app
  // must not reload itself *out of a room*: operations can be in flight there,
  // and #313 treats losing them as serious enough for a beforeunload prompt.
  //
  // `prompt` does not mean the user is always asked — since #400 they usually
  // are not. It means the decision is ours rather than the plugin's, and it is
  // made per situation in lib/registerServiceWorker.ts + pwa/updatePolicy.ts:
  // applied silently where nothing is at risk, offered only to an installed
  // app that is holding a room, never offered in a browser tab. Note this is
  // about a build found *while a tab is open*; a newly opened tab gets the new
  // build outright since #502, without asking anyone.
  registerType: 'prompt',
  // The manifest already exists as a static file (#47) and is linked from
  // index.html; generating one here would produce a second, competing one.
  manifest: false,
  // Registration is ours (lib/registerServiceWorker.ts): the update offer has
  // to go through the app's own notification strip (#343), and the periodic
  // re-check added by #400 has nowhere else to live — the plugin's own
  // registration only ever checks once, at boot.
  injectRegister: null,
  // The dev loop stays exactly as it was: no service worker under `npm run
  // dev`. A worker in dev caches modules Vite is trying to hot-swap, and the
  // resulting "why is my edit not showing" is expensive to recognise. Test it
  // against a real build instead — `npm run build && npm run preview`, where
  // localhost counts as a trustworthy origin and workers are allowed.
  devOptions: { enabled: false },
})

/** Shared by the dev server and `preview`: both have to reach the same local
 *  backend, and a copy would be one more thing to keep in step. */
function apiProxy() {
  return {
    '/api': `http://localhost:${SERVER_PORT}`,
    '/socket.io': { target: `http://localhost:${SERVER_PORT}`, ws: true },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const useHttps = mode !== 'http'
  return {
    build: sentryAuthToken ? { sourcemap: 'hidden' } : {},
    // (#177) Tree-shaking flags the Sentry SDK reads at build time: we never
    // trace, and its debug logging has no business in a shipped bundle.
    // Measured worth 1.6 kB gzip on the entry chunk — less than hoped, and
    // kept anyway because it costs nothing and states the intent. The SDK's
    // real price is the ~27 kB gzip it adds to that chunk regardless, which
    // is the number to weigh against #324's load-time budget if it ever
    // comes to that.
    define: { __SENTRY_DEBUG__: false, __SENTRY_TRACING__: false },
    plugins: [
      react(),
      pwa,
      ...(useHttps ? [mkcert()] : []),
      ...(sentryAuthToken
        ? [sentryVitePlugin({
          authToken: sentryAuthToken,
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          release: { name: process.env.VITE_SENTRY_RELEASE },
          sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.js.map'] },
        })]
        : []),
    ],
    server: {
      // Vite 8's server.https only accepts an options object (or undefined)
      // — no more `https: true` shorthand. `{}` (defaults) is enough: the
      // mkcert plugin patches in its own cert/key onto this at config-resolve
      // time, so there's nothing to supply here beyond "on".
      https: useHttps ? {} : undefined,
      proxy: apiProxy(),
    },
    // (#400) The same proxy for `npm run preview`, which does *not* inherit
    // `server.proxy`. The PWA block above tells the next reader to test the
    // service worker against a real build here — and until this existed that
    // instruction only worked for the parts of the app that never call the
    // API, which is not the part anyone needs a real build to test.
    preview: { proxy: apiProxy() },
  }
})
