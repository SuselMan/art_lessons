import { expect, test } from '@playwright/test'

import { E2E_APP_VERSION } from '../support/stack'

/** (#515) The build identity, where a person can actually reach it.
 *
 *  This is the smallest possible test and it earns its place on history: the
 *  question "which build is this device running?" has been answered by guessing
 *  three times now, and wrongly at least twice (#294, and the #514 deploy that
 *  prompted this). The fix is only a fix if the string is *on the screen* — a
 *  version constant that resolves correctly in a unit test and renders nowhere
 *  is exactly the state we were already in, since `VITE_SENTRY_RELEASE` has
 *  been correct and invisible for months.
 *
 *  So it has to be a browser, and the assertion has to be the literal injected
 *  string: anything weaker (non-empty, matches a pattern) would pass for a row
 *  that displays the wrong build.
 */
test.describe('app version (#515)', () => {
  test('settings shows exactly the version this build was stamped with', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText(E2E_APP_VERSION, { exact: true })).toBeVisible()
  })

  test('and the same string is on globalThis, for a console that has no UI', async ({ page }) => {
    // The device with the problem is never the device debugging it. This is the
    // path a remote CDP attach or a pasted devtools line uses — see
    // lib/appVersion.ts's exposeAppVersion.
    //
    // Declared locally rather than reaching for the app's own `declare global`:
    // the e2e project is a separate tsconfig with none of src/ in it, which is
    // deliberate (see tsconfig.e2e.json) and means this file states what it
    // expects to find rather than importing a promise of it.
    await page.goto('/settings')
    await expect
      .poll(() => page.evaluate<string | undefined>('globalThis.__APP_VERSION__'))
      .toBe(E2E_APP_VERSION)
  })
})
