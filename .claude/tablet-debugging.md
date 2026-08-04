# Debugging the tablet (Android) over Wi-Fi

Written 2026-07-26, during #298 — the bug that only ever reproduced on
Ilya's tablet and was invisible from desktop. Getting attached took most of
an hour of fumbling; this is the path that actually worked, so the next
session can skip straight to measuring.

Device: Samsung Galaxy Tab S7+ (`SM-T970`), Android 13, 5.7 GB RAM, 4 GB swap.

## Why Wi-Fi and not USB

USB did not enumerate at all — `Get-PnpDevice` showed no Android or MTP
entry, so almost certainly a charge-only cable. Wireless debugging worked
first try and needs no drivers. If USB is ever wanted, the tell is whether
Windows lists a portable device *before* any adb involvement; if it doesn't,
it's the cable.

## One-time on this machine

```
winget install --id Google.PlatformTools -e --accept-source-agreements --accept-package-agreements
```

Ilya has to run this himself (`! winget …` in the session) — it wants UAC and
agreement prompts that hang a non-interactive shell.

It does **not** land on PATH for already-running shells. Use the full path:

```
C:\Users\Ilya\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe
```

## Connecting

On the tablet: Settings → Developer options → **Wireless debugging** (open it,
don't just toggle it).

Two *different* ports are involved and mixing them up is the main way this
goes wrong:

1. **Pairing** — inside "Pair device with pairing code". Gives `IP:PORT` plus a
   six-digit code. That screen must stay open while pairing runs.
2. **Connecting** — on the main Wireless debugging screen, a different
   `IP:PORT`.

```bash
adb pair 192.168.1.123:44313 147722     # pairing port + code
adb connect 192.168.1.123:43887         # connect port
adb devices -l
```

`adb mdns services` **does** work on this machine as of 2026-07-30 — it lists
both ports, so only the *pairing* pair (address + code) has to be read off the
screen and the connect port can be discovered:

```bash
adb mdns services
# adb-R52RB0JXVSY-9uOPiI  _adb-tls-pairing._tcp  192.168.1.123:42781
# adb-R52RB0JXVSY-9uOPiI  _adb-tls-connect._tcp  192.168.1.123:37273
```

`adb pair` also connected the device by itself that day — `adb devices -l`
showed it immediately after pairing, with no `adb connect` at all. Ask for the
connect port only if both of those come up empty (it was needed in #298, when
mDNS found nothing).

Once both USB and Wi-Fi transports exist, `adb` refuses bare commands with
`more than one device/emulator`. Pass `-s 192.168.1.123:43887` explicitly.

## Chrome DevTools Protocol

```bash
adb -s <device> forward tcp:9222 localabstract:chrome_devtools_remote
curl http://127.0.0.1:9222/json/version
curl http://127.0.0.1:9222/json/list      # find the page's webSocketDebuggerUrl
```

`/json/list` gives every open tab. From there a plain `ws` client (already in
`node_modules`, via socket.io) speaks CDP — `Runtime.evaluate` with
`awaitPromise: true, returnByValue: true` is enough for almost everything:
reading `performance.memory`, dumping IndexedDB, clicking buttons,
inspecting canvases. `Page.reload`, `Log.enable` + `Runtime.enable` for
console errors, and `Inspector.enable` for `Inspector.targetCrashed`.

Note the Chrome extension MCP tools drive the *desktop* browser only. The
tablet needs this CDP path.

## What to measure, and what each answers

```bash
# Is the whole device starving, or just this process?
adb -s <d> shell "grep -E 'MemTotal|MemAvailable|SwapFree' /proc/meminfo"

# Which Chrome processes exist, and how big. No sandboxed_process => the
# renderer is already dead and the tab is showing a crash state.
adb -s <d> shell "ps -A -o PID,RSS,NAME | grep chrome"

# Where a renderer's memory actually is. `Unknown` is web-content memory
# (V8, PartitionAlloc, socket buffers); `Graphics` is GPU. Both matter and
# they mislead if confused.
adb -s <d> shell "dumpsys meminfo <renderer-pid>"

# The decisive one for crashes. Filter narrowly — an unfiltered logcat is
# thousands of SurfaceFlinger lines per minute.
adb -s <d> logcat -c
adb -s <d> logcat | grep -iE 'lmkd|OutOfMemory|has died|Reclaim|targetCrashed'
```

`lmkd: Reclaim '<process>' … reason: low watermark is breached` is the
low-memory killer, i.e. *device-wide* exhaustion, not a renderer heap limit.
In #298 it took the launcher, Play Services and Telegram down alongside the
tab — if unrelated apps are dying too, stop looking at V8 heap numbers.

## Traps hit in #298, worth not re-learning

- **Sampling RSS once proves nothing.** The signal was the *shape*: 275 → 512
  → 345 → 512 MB. A sawtooth is repeated large allocation, not a leak, and
  points somewhere completely different than a monotonic climb would.
- **`performance.memory` was 73 MB while the process held 370 MB.** JS heap
  is a small slice; typed arrays, socket buffers and PartitionAlloc are not
  in it. Believing it would have cleared the real culprit.
- **IndexedDB is inspectable and worth inspecting.** Reading the outbox store
  directly — 384 entries, 42–181 attempts each — is what turned a guess into
  a diagnosis. Do that before theorising.
- **Check the loaded bundle hash against production** (`performance
  .getEntriesByType('resource')` vs `curl` of prod `index.html`). A stale
  bundle silently invalidates every measurement; this cost one full
  wrong conclusion (see #294) — and then a second one on 2026-07-30, which is
  why this is now the *first* step of a tablet run rather than a caveat:

  - A backgrounded tab keeps running the build it loaded, for hours. Chrome on
    Android reloads it when it comes back to the foreground — **including when
    `Page.bringToFront` is what brings it there**, so the act of attaching can
    silently swap the code under test. Read the hashes before touching
    anything, and note that `index-*.js` alone is not enough: route chunks
    (`Room-*.js`, `Room-*.css`) carry the editor and change on their own.
  - Two fixes (#357, #358) both looked broken on a stale tab and both worked on
    the reloaded one, an hour apart. "The fix didn't work" from a tablet means
    "check what the tablet is running" first.
  - A stale tab is not only a wrong answer, it can be the bug: one holding
    IndexedDB at the old version blocks the new build's upgrade in every other
    tab (#358 — the outbox lost durability there while the old tab drained the
    store unscoped into its own room).

- **A frozen tab does not answer `Runtime.evaluate`.** Android freezes
  background renderers, and the call simply never returns — indistinguishable
  from a hung page. Send `Page.bringToFront` first (mind the reload above), or
  have Ilya put the tab on screen.

- **The app is installed as a PWA there, and that changes two things.** The
  foreground activity is `SameTaskWebApkActivity`, not a Chrome tab, and
  `/json/list` shows it like any other page — but there is no tab strip and no
  URL bar, so anything that would normally be "just navigate" has to happen
  inside the app.

  Driving a hard navigation from the page (`location.assign`) raises Chrome's
  native `beforeunload` dialog — "Закрыть сайт? Изменения могут не
  сохраниться." — and a native dialog blocks every subsequent CDP command.
  That reads *exactly* like a frozen renderer: `Runtime.evaluate` never
  returns, `Page.bringToFront` does not help, and `dumpsys power` says the
  device is awake. `Page.handleJavaScriptDialog` cannot clear it either if
  `Page.enable` came after the dialog opened. `adb exec-out screencap -p`
  answers in one shot what ten minutes of protocol poking will not — take the
  screenshot first when the tablet stops answering, then dismiss with
  `adb shell input tap`.

  For leaving a room, click the wordmark button
  (`aria-label="Grafetto — leave this project"`) and then the modal's "Leave".
  That is the real unmount path anyway — a hard navigation would not run
  React's cleanup, so the exit-time work under test (#382's thumbnail bake)
  never fires.

- **A finger does not draw — synthesize a pen.** `PointerInput.ts` drops
  `pointerType === 'touch'` outright (touch pans/zooms the viewport at a level
  above the engine), so `Input.dispatchTouchEvent` produces gestures, not
  strokes. Eighty of them recorded zero operations and left the page parked
  3912 px off screen, which reads as "the canvas is blank" until you check the
  wrap's transform. Use `Input.dispatchMouseEvent` with `pointerType: 'pen'`
  and a `force`; ~90 ms between strokes, or consecutive ones merge into one
  gesture. Verify against Postgres (`select count(*) from "Operation" where
  "roomId"=…`) rather than against the screen — that is the difference between
  "it drew" and "it looked like it drew".

- **Emulate offline per page, never on the device.** `Network.emulateNetworkConditions`
  with `offline: true` cuts only that page's network, so the adb-over-wifi
  transport this whole setup depends on survives. Turning wifi off on the
  tablet would take the debugger with it.

- **Instrument in the page, then ask for the tap.** Ilya's finger is the only
  input that reproduces touch faithfully, and a round trip costs a message —
  so install a `MutationObserver`/listener probe that records rects, computed
  styles, `elementFromPoint` hits and follow-up state into a global array, ask
  for the gesture, then read the array. One exchange instead of one per
  question, and it captures menus and toasts that are gone by the time you
  look.
