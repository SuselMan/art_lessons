/** (#616) How much slower than a GPU this run is allowed to be.
 *
 *  Every wait in the suite was sized against a real GPU on a developer's
 *  machine. The CI run is the software rasteriser on a two-core runner (see
 *  the launchOptions comment in playwright.config.ts), and it measured about
 *  four times slower end to end: two-browser scenarios — a teacher and a
 *  student both rendering in software — ran out of time while doing nothing
 *  wrong. One factor for every timeout rather than a patch per spec, so the
 *  GPU run keeps exactly the waits it had and the slow run scales them all
 *  together.
 */
export const PACE = process.env.E2E_GL === 'swiftshader' ? 3 : 1

/** A timeout sized for a GPU, stretched for this run. */
export function slow(ms: number): number {
  return ms * PACE
}
