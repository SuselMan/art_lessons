# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: version.spec.ts >> app version (#515) >> and the same string is on globalThis, for a console that has no UI
- Location: e2e/specs/version.spec.ts:25:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "2026.01.02-abcdef0"
Received: "2026.10.02-8990c47-qa"

Call Log:
- Timeout 15000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - link "Grafetto" [ref=e5] [cursor=pointer]:
      - /url: /
      - img "Grafetto" [ref=e6]
    - navigation [ref=e17]:
      - link "Log in" [ref=e18] [cursor=pointer]:
        - /url: /login
      - link "Settings" [ref=e19] [cursor=pointer]:
        - /url: /settings
  - generic [ref=e20]:
    - heading "Settings" [level=1] [ref=e21]
    - generic [ref=e22]:
      - generic [ref=e23]: Language
      - radiogroup "Language" [ref=e25]:
        - radio "English" [checked] [ref=e26] [cursor=pointer]:
          - generic [ref=e28]: 
        - radio "Русский" [ref=e29] [cursor=pointer]
      - paragraph [ref=e31]: Detected from your browser at first visit. Saved in this browser only.
    - generic [ref=e32]:
      - generic [ref=e33]: Appearance
      - radiogroup "Appearance" [ref=e35]:
        - radio "Dark" [ref=e36] [cursor=pointer]
        - radio "Light (higher contrast)" [checked] [ref=e38] [cursor=pointer]:
          - generic [ref=e40]: 
      - paragraph [ref=e41]: Light is the more legible of the two — stronger text and clearly drawn edges. Taken from your system at first visit. Saved in this browser only.
    - generic [ref=e42]:
      - generic [ref=e43]: Interface
      - radiogroup "Interface" [ref=e45]:
        - radio "Tablet" [ref=e46] [cursor=pointer]
        - radio "Computer" [checked] [ref=e48] [cursor=pointer]:
          - generic [ref=e50]: 
      - paragraph [ref=e51]: Tablet is laid out for a finger and a stylus, computer for a mouse, a keyboard and a graphics tablet. Detected from your device at first visit — each of your devices keeps its own.
    - generic [ref=e52]:
      - generic [ref=e53]: Phone layout
      - radiogroup "Phone layout" [ref=e55]:
        - radio "Follow screen size" [checked] [ref=e56] [cursor=pointer]:
          - generic [ref=e58]: 
        - radio "Always" [ref=e59] [cursor=pointer]
        - radio "Never" [ref=e61] [cursor=pointer]
      - paragraph [ref=e63]: On a small screen the editor shows notes and the annotation pen instead of the drawing tools, and one finger draws while two move the canvas. Drawing itself stays on the tablet and the computer.
    - generic [ref=e64]:
      - generic [ref=e65]: Version
      - generic [ref=e66]:
        - code [ref=e67]: 2026.10.02-8990c47-qa
        - code [ref=e68]: акварель r43 (§17.73)
        - button "Check for updates" [ref=e69] [cursor=pointer]
      - paragraph [ref=e70]: Quote this when reporting a problem — it says exactly which build this device is running.
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
  22 |     await expect(page.getByText(E2E_APP_VERSION, { exact: true })).toBeVisible()
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
> 37 |       .toBe(E2E_APP_VERSION)
     |        ^ Error: expect(received).toBe(expected) // Object.is equality
  38 |   })
  39 | })
  40 | 
```