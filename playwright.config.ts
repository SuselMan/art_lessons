import { defineConfig, devices } from '@playwright/test'

import { E2E_APP_VERSION, SERVER_HEALTH_URL, SERVER_PORT, WEB_PORT, WEB_URL } from './e2e/support/stack'

/** (#491, трек #314 §12) End-to-end tests in a real browser.
 *
 *  Why a browser at all, when there are already 1800 unit tests: none of them
 *  touch a React component, and none of them can. Two facts about this project
 *  put its actual subject out of reach of jsdom and MockGL —
 *
 *  - events dispatched from JavaScript do not commit anything to the canvas.
 *    Only real input does, which in practice means CDP, which in practice
 *    means a real browser driving a real page.
 *  - MockGL never rasterizes. An engine test can assert that a draw call was
 *    issued; it cannot assert that a stroke is *there*, because there are no
 *    pixels in a mock.
 *
 *  So the whole of "open a room, draw, see the mark" — the app's one
 *  irreducible user path — has until now been checked by hand, on a tablet,
 *  once per release candidate. §9 of the release track is seven such manual
 *  passes, and every one of them goes stale at the next commit.
 *
 *  **How the assertions work.** Not screenshots. `window.__engine` is the
 *  live engine, exposed in dev builds (see lib/devEngineHandle.ts), and its
 *  own API answers the questions these tests ask: `pickColor` reads a pixel
 *  out of the composited framebuffer (the context is created with
 *  `preserveDrawingBuffer: true`, so that read is stable from outside a
 *  frame), `getContentBounds` says where the paint actually landed, and
 *  `getOperations` is the log. That is a stronger claim than a golden image
 *  and a far weaker commitment: a paper-grain canvas would make pixel-exact
 *  screenshots a source of false failures on every GPU that isn't the one
 *  they were recorded on.
 *
 *  **Ports and data.** Everything is this run's own — see e2e/support/stack.ts.
 *  Nothing here may touch the dev server, its database, or another worktree's.
 */
export default defineConfig({
  testDir: './e2e/specs',
  // The room is a socket app with a server, a database, and a WebGL canvas at
  // the end of it. Serial by default: two rooms would share one server and one
  // database happily enough, but a failure caused by that sharing is expensive
  // to recognise and this suite is small. Revisit when it stops being small.
  workers: 1,
  fullyParallel: false,
  // A stroke has to be drawn, acknowledged by the server and painted; the
  // default 30s is enough for all of it, but not for the *first* test, which
  // also waits out Vite's cold dependency optimisation.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalTeardown: './e2e/globalTeardown.ts',

  use: {
    baseURL: WEB_URL,
    // Kept only for failures: a passing run should leave nothing behind, and a
    // failing one should leave everything needed to see why without a rerun.
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // A fixed, generous window so the canvas has room and so the app takes its
    // desktop layout rather than the touch one (which hides most of the UI
    // behind a minimal-UI mode these tests would then have to undo).
    viewport: { width: 1400, height: 900 },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1400, height: 900 },
        // The engine is WebGL1 and the assertions read real pixels out of it,
        // so a software rasteriser is not an acceptable substitute for a GPU
        // here — `--use-gl=angle` keeps headless Chromium on a real backend
        // instead of quietly falling back to SwiftShader, where "the stroke is
        // there" would be measuring something else entirely.
        launchOptions: { args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist'] },
      },
    },
  ],

  webServer: [
    {
      // Through a wrapper, not straight at the server, and the reason is an
      // ordering fact worth stating twice: Playwright launches `webServer`
      // *before* `globalSetup`, so a database brought up there would arrive
      // long after the health check had given up waiting for it. serveApi.ts
      // owns both steps in the only order that works, and keeps the server out
      // of the developer's own .env while it is at it — see its own comment.
      command: 'npx tsx e2e/serveApi.ts',
      url: SERVER_HEALTH_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // `--strictPort` on purpose: Vite's default is to hop to the next free
      // port, which would leave the tests pointed at nothing while the app ran
      // happily somewhere else. A clash should be a loud failure.
      command: `npm run dev:http --workspace=apps/web -- --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      // (#515) A realistic version string, so the Settings row can be asserted
      // as the thing a person actually reads rather than as the `dev` fallback.
      // Vite picks VITE_-prefixed variables out of the environment in dev the
      // same way it does in a build, so this needs no config of its own.
      env: { SERVER_PORT: String(SERVER_PORT), VITE_APP_VERSION: E2E_APP_VERSION },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
