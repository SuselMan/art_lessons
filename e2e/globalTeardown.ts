import { removeDatabase } from './support/database'

/** (#491) Takes the throwaway database away again.
 *
 *  `E2E_KEEP_DB=1` leaves it standing, which is what you want while writing a
 *  scenario: the next run recreates it regardless (see ensureDatabase), but
 *  you can open psql against the state a failing test left behind. Off by
 *  default — a harness that quietly accumulates containers on somebody's
 *  machine is a harness they stop running. */
export default function globalTeardown(): void {
  if (process.env.E2E_KEEP_DB === '1') return
  removeDatabase()
}
