/** (#491) The one place the test stack's identity is written down.
 *
 *  Every number here is deliberately far from the ones a person is using:
 *  the dev server sits on 5173/4000 and Postgres on 5432, and this repo
 *  routinely has several worktrees running their own copies next to each
 *  other. A harness that borrowed any of those would either fight a live
 *  session for a port or — much worse, and silently — write its test rooms
 *  into a database somebody is actually working in.
 *
 *  The Postgres container is disposable and created per run (see
 *  globalSetup.ts). It is never `art_lessons_pg`.
 */

export const WEB_PORT = 5491
export const SERVER_PORT = 4491
export const DB_PORT = 55491

export const DB_CONTAINER = 'grafetto_pg_e2e'
export const DB_USER = 'e2e'
export const DB_NAME = 'e2e'
export const DB_PASSWORD = 'e2e'

export const DATABASE_URL =
  `postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${DB_PORT}/${DB_NAME}`

/** Not a secret: this process is thrown away with the container it talks to.
 *  It exists because `identity.ts` requires it at import time — a server
 *  without one does not start at all. */
export const JWT_SECRET = 'e2e-not-a-secret-e2e-not-a-secret'

export const BASE_URL = `http://127.0.0.1:${WEB_PORT}`

/** Plain http on purpose. The dev server is https by default (mkcert, so a
 *  tablet on the LAN can trust it — see apps/web/vite.config.ts), and that
 *  cert is trusted only on machines whose mkcert CA is installed. `dev:http`
 *  already exists for exactly this kind of localhost work, and the app is
 *  same-origin throughout — `/api` and `/socket.io` are proxied through this
 *  same port — so nothing here needs a trustworthy origin. The one thing that
 *  does is the AudioWorklet (pencil sound), which no scenario touches. */
export const WEB_URL = BASE_URL
export const SERVER_HEALTH_URL = `http://127.0.0.1:${SERVER_PORT}/api/health`

/** (#515) The version the harness builds the app with. A plausible-looking
 *  deploy stamp rather than a placeholder, because what the Settings row is
 *  asserted to do is show *exactly* the injected string — a fake that did not
 *  match the real format would let a formatting bug through. The date is
 *  fixed, not today's: a test whose expected value changes daily is a test
 *  that fails on the day nobody touched it. */
export const E2E_APP_VERSION = '2026.01.02-abcdef0'
