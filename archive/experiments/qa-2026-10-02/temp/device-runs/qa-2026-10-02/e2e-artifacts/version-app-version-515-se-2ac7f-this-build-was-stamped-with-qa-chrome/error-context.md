# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: version.spec.ts >> app version (#515) >> settings shows exactly the version this build was stamped with
- Location: e2e/specs/version.spec.ts:20:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('2026.01.02-abcdef0', { exact: true })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByText('2026.01.02-abcdef0', { exact: true })

```

```yaml
- banner:
  - link "Grafetto":
    - /url: /
    - img "Grafetto":
      - img
  - navigation:
    - link "Log in":
      - /url: /login
    - link "Settings":
      - /url: /settings
- heading "Settings" [level=1]
- text: Language
- radiogroup "Language":
  - radio "English" [checked]
  - radio "Русский"
- paragraph: Detected from your browser at first visit. Saved in this browser only.
- text: Appearance
- radiogroup "Appearance":
  - radio "Dark"
  - radio "Light (higher contrast)" [checked]
- paragraph: Light is the more legible of the two — stronger text and clearly drawn edges. Taken from your system at first visit. Saved in this browser only.
- text: Interface
- radiogroup "Interface":
  - radio "Tablet"
  - radio "Computer" [checked]
- paragraph: Tablet is laid out for a finger and a stylus, computer for a mouse, a keyboard and a graphics tablet. Detected from your device at first visit — each of your devices keeps its own.
- text: Phone layout
- radiogroup "Phone layout":
  - radio "Follow screen size" [checked]
  - radio "Always"
  - radio "Never"
- paragraph: On a small screen the editor shows notes and the annotation pen instead of the drawing tools, and one finger draws while two move the canvas. Drawing itself stays on the tablet and the computer.
- text: Version
- code: 2026.10.02-8990c47-qa
- code: акварель r43 (§17.73)
- button "Check for updates"
- paragraph: Quote this when reporting a problem — it says exactly which build this device is running.
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test'
  2  | 
  3  | import { E2E_APP_VERSION } from '../support/stack'
  4  | 
  5  | /** (#515) The build identity, where a person can actually reach it.
  6  |  *
  7  |  *  This is the smallest possible test and it earns its place on history: the
  8  |  *  question "which build is this device running?" has been answered by guessing
  9  |  *  three times now, and wrongly at least twice (#294, and the #514 deploy that
  10 |  *  prompted this). The fix is only a fix if the string is *on the screen* — a
  11 |  *  version constant that resolves correctly in a unit test and renders nowhere
  12 |  *  is exactly the state we were already in, since `VITE_SENTRY_RELEASE` has
  13 |  *  been correct and invisible for months.
  14 |  *
  15 |  *  So it has to be a browser, and the assertion has to be the literal injected
  16 |  *  string: anything weaker (non-empty, matches a pattern) would pass for a row
  17 |  *  that displays the wrong build.
  18 |  */
  19 | test.describe('app version (#515)', () => {
  20 |   test('settings shows exactly the version this build was stamped with', async ({ page }) => {
  21 |     await page.goto('/settings')
> 22 |     await expect(page.getByText(E2E_APP_VERSION, { exact: true })).toBeVisible()
     |                                                                    ^ Error: expect(locator).toBeVisible() failed
  23 |   })
  24 | 
  25 |   test('and the same string is on globalThis, for a console that has no UI', async ({ page }) => {
  26 |     // The device with the problem is never the device debugging it. This is the
  27 |     // path a remote CDP attach or a pasted devtools line uses — see
  28 |     // lib/browser/appVersion.ts's exposeAppVersion.
  29 |     //
  30 |     // Declared locally rather than reaching for the app's own `declare global`:
  31 |     // the e2e project is a separate tsconfig with none of src/ in it, which is
  32 |     // deliberate (see tsconfig.e2e.json) and means this file states what it
  33 |     // expects to find rather than importing a promise of it.
  34 |     await page.goto('/settings')
  35 |     await expect
  36 |       .poll(() => page.evaluate<string | undefined>('globalThis.__APP_VERSION__'))
  37 |       .toBe(E2E_APP_VERSION)
  38 |   })
  39 | })
  40 | 
```