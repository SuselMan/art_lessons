---
name: verify
description: Build, launch and drive the web app to verify engine/UI changes end-to-end
---

# Verifying apps/web changes

## Launch

From repo root: `npm run dev` (vite --host, port 5173). Ready in ~2s; probe with
`Invoke-WebRequest http://localhost:5173/create`.

## Drive

Claude-in-Chrome extension is often not connected on this machine. Working
fallback: `playwright-core` (npm i in scratchpad, no browser download) with
`chromium.launch({ channel: 'chrome', headless: true })` — uses installed Chrome.

Flow to reach the editor:
1. `goto /create`, fill first `input[type="text"]` with a room name,
   click the last button matching /create/i → redirects to `/room/:id`.
2. Canvas is the only `<canvas>`; it is CSS-scaled to fit, so compute stroke
   coordinates as **fractions of its boundingBox**, never absolute pixels.
3. Draw with `page.mouse` down/move/up (mouse pressure defaults to 0.5).
4. Canvas state assertions: `preserveDrawingBuffer` is on, so
   `canvas.toDataURL()` works — hash it to compare states across undo/redo.
   Deterministic replay means redo must reproduce the exact hash.

## Gotchas

- Layer numbering counts the background: first added layer is "Layer 3".
- Panel buttons by title: `Add layer`, `Merge…`, `Delete…`; layer rows by text.
- Merge-down needs the active layer to have a drawable layer below it —
  activate a row by clicking its name first.
- `/favicon.ico` 404s — pre-existing, ignore.
- Hotkeys: Ctrl+Z undo, Ctrl+Shift+Z redo (must not be focused in an input).

A ready driver script pattern from issue #8 verification: create room → stroke →
undo/redo hash checks → layer add/delete/undo → merge/undo/redo → opacity slider.
