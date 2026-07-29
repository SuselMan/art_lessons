import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'
import { sentryVitePlugin } from '@sentry/vite-plugin'

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
const SERVER_PORT = 4000

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
      proxy: {
        '/api': `http://localhost:${SERVER_PORT}`,
        '/socket.io': { target: `http://localhost:${SERVER_PORT}`, ws: true },
      },
    },
  }
})
