// (#515) Which build is this, in a form a person can read off a screen.
//
// The project already had a build identity — `VITE_SENTRY_RELEASE`, the commit
// sha, injected by deploy.yml — and it went exactly one place: Sentry's issue
// metadata. Nothing in the running app could say which build it was, which
// made "is this tablet on the latest version?" a question answerable only by
// comparing bundle hashes against the server, from a desktop, over ssh. That
// is not a check anyone performs mid-lesson, so in practice the answer was
// guessed, and a guess of "it must be stale" is indistinguishable from a guess
// of "it must be fixed". Both have been made here, and both were wrong once.
//
// So the version is a first-class, visible thing: shown in Settings, put on
// `globalThis` for a console or a CDP session to read, and named in the
// update offer. It is deliberately *not* a semver — nothing here is released
// or depended on by version number. What it has to support is one comparison
// by eye against "what did the last deploy say", which is why the date leads:
// staleness is legible without knowing any sha at all.

/** The build-time inputs this module reads. A plain shape rather than
 *  `import.meta.env` directly, so the resolution is testable without a Vite
 *  build — same reasoning as lib/sentry.ts's own SentryBuildEnv. */
export interface VersionBuildEnv {
  VITE_APP_VERSION?: string
  DEV?: boolean
}

/** What a build with no injected version calls itself. `npm run dev` and a
 *  local `npm run build` both land here, and both should say so plainly
 *  rather than inventing a number: a version string that cannot be traced to
 *  a deploy is worse than an honest "not a deploy". */
export const DEV_VERSION = 'dev'

/** CI's format, asserted here rather than only in the workflow: `2026.08.28-7041f19`.
 *  Anything else is passed through untouched — a hand-set `VITE_APP_VERSION`
 *  is a legitimate thing to do when bisecting a device-specific bug — but it
 *  is what deploy.yml produces and what the deploy report quotes. */
export const VERSION_PATTERN = /^\d{4}\.\d{2}\.\d{2}-[0-9a-f]{7}$/

export function resolveAppVersion(env: VersionBuildEnv): string {
  const injected = env.VITE_APP_VERSION?.trim()
  return injected ? injected : DEV_VERSION
}

/** This build's version. A module-level constant rather than a function call
 *  per read: it is fixed at build time by definition, and a component
 *  re-rendering must not look like it could change. */
export const APP_VERSION = resolveAppVersion(import.meta.env)

/** Whether this build came from a deploy at all. The Settings row uses it to
 *  avoid offering an update check that cannot mean anything locally (there is
 *  no service worker in dev). */
export function isDeployedBuild(version = APP_VERSION): boolean {
  return version !== DEV_VERSION
}

/** Puts the version where a console, a CDP session or a bug report can reach
 *  it without a UI. Called once at boot from main.tsx.
 *
 *  Not dev-only, unlike lib/devEngineHandle: a version string is the one piece
 *  of state whose whole purpose is to be readable on the machine that has the
 *  problem, which is never this one. It exposes nothing — the same string is
 *  already visible in Settings and in the bundle. */
export function exposeAppVersion(version = APP_VERSION): void {
  globalThis.__APP_VERSION__ = version
}

declare global {
  // eslint-disable-next-line no-var
  var __APP_VERSION__: string | undefined
}
