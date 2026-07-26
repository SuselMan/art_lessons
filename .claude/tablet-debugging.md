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

`adb mdns services` found nothing on this machine (no Bonjour), so the
connect port has to come from the screen — it cannot be discovered.

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
  wrong conclusion (see #294).
