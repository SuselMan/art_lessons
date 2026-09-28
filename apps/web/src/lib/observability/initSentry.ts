// (#177) Side-effecting module whose only job is to be the *first* import of
// main.tsx. ES imports are evaluated in order, so anything that runs while
// another module is still being evaluated — a top-level throw in the engine,
// a store that fails to read localStorage in a locked-down browser — is only
// reported if Sentry is already up by then. Calling initSentry() from
// main.tsx's own body would be too late for exactly those.
import { initSentry } from './sentry'

initSentry()
