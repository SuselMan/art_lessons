// (#570) Whether this browser can hand out a WebGL context at all.
//
// The engine needs one and throws `WebGL not supported` when it does not get
// it (engine/index.ts) — from inside Room's mount effect, which nothing
// catches, so React unmounted the whole root: a black page, an empty
// console, and for the creator a `/room/<id>` link to a room that was never
// sent to the server (create_room goes out after the engine is up). Chrome
// with GPU acceleration switched off — after a crash, a policy, or the
// browser binary being replaced underneath a running instance — is enough to
// get there, and so is a tablet whose driver is on the blocklist.
//
// Asked *before* anything depends on the answer: CreateRoom before it mints
// an id and navigates, Room before it renders the editor. The probe is a
// throwaway canvas, released straight away (`WEBGL_lose_context`) so it does
// not occupy one of the browser's ~16 context slots next to the real one.

export type WebGLProbe =
  | { ok: true }
  /** `reason` is the browser's own `webglcontextcreationerror` message when
   *  it gave one (Chrome's includes the GL vendor/renderer and why — e.g.
   *  `GL_RENDERER = Disabled`), `null` when it silently returned no
   *  context. Shown as small print for whoever ends up debugging it, never
   *  as the explanation itself. */
  | { ok: false; reason: string | null }

/** A `Document` is enough of the DOM to run the probe; injectable so the
 *  decision can be tested without a browser. */
export function probeWebGL(doc: Document = document): WebGLProbe {
  let reason: string | null = null
  try {
    const canvas = doc.createElement('canvas')
    // Chrome attaches the failure diagnostics to this event rather than
    // throwing — without a listener the reason is lost entirely.
    canvas.addEventListener('webglcontextcreationerror', e => {
      reason = (e as WebGLContextEvent).statusMessage || null
    })
    const gl = canvas.getContext('webgl')
    if (!gl) return { ok: false, reason }
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return { ok: true }
  } catch (err) {
    // A `getContext` that throws (some headless/embedded runtimes) is the
    // same answer as one that returns null.
    return { ok: false, reason: err instanceof Error ? err.message : reason }
  }
}
