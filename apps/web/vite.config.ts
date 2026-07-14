import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'

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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const useHttps = mode !== 'http'
  return {
    plugins: [react(), ...(useHttps ? [mkcert()] : [])],
    server: {
      https: useHttps,
      proxy: {
        '/api': `http://localhost:${SERVER_PORT}`,
        '/socket.io': { target: `http://localhost:${SERVER_PORT}`, ws: true },
      },
    },
  }
})
