import type { ClientEnvironment } from '@grafetto/shared'

import { api } from './api'
import { APP_VERSION } from '../browser/appVersion'
import { DEVICE_TYPE_STORAGE_KEY, type DeviceType } from '../browser/deviceType'

/** (#589) What this browser tells the server about itself, once per page load
 *  — the first thing asked about almost every bug here (which build, tablet or
 *  desktop, which GPU, pen or finger) and the one thing no request header
 *  answers. It lands on this device's row in the admin panel.
 *
 *  Deliberately diagnostic and nothing more: no fonts, no canvas hash, no
 *  location — the fields a fingerprinting script would want and a bug report
 *  never does. What *is* sent is named in the privacy policy (#323). */

/** Sticky across loads: a pen is a fact about the device, and a page load in
 *  which nobody happened to draw must not report it as gone. */
const PEN_SEEN_KEY = 'al_pen_seen'
let penSeenThisPage = false
let pageGpuInfo: ReturnType<typeof probeGpuInfo> | undefined

function readPenSeen(): boolean {
  if (penSeenThisPage) return true
  try {
    penSeenThisPage = localStorage.getItem(PEN_SEEN_KEY) === '1'
    return penSeenThisPage
  } catch {
    return false
  }
}

function gpuInfo(): ReturnType<typeof probeGpuInfo> {
  return pageGpuInfo ??= probeGpuInfo()
}

function probeGpuInfo(): Pick<ClientEnvironment, 'webgl' | 'gpuVendor' | 'gpuRenderer' | 'maxTextureSize'> {
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    if (!gl) return { webgl: false }
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    const info: ClientEnvironment = {
      webgl: true,
      // Firefox has deprecated the extension and answers the plain
      // parameters unmasked instead, so fall back to those.
      gpuVendor: String(gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR)),
      gpuRenderer: String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
      maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return info
  } catch {
    return { webgl: false }
  }
}

function pointerKind(): string {
  if (matchMedia('(pointer: coarse)').matches) return 'coarse'
  if (matchMedia('(pointer: fine)').matches) return 'fine'
  return 'none'
}

function deviceTypeChosen(): boolean {
  try {
    // The store only writes this key when the person picks one in Settings;
    // detection alone never does (settingsStore.ts).
    return localStorage.getItem(DEVICE_TYPE_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

export function collectEnvironment(deviceType: DeviceType): ClientEnvironment {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return {
    appVersion: APP_VERSION,
    deviceType,
    deviceTypeChosen: deviceTypeChosen(),
    screenW: screen.width,
    screenH: screen.height,
    dpr: window.devicePixelRatio,
    viewportW: window.innerWidth,
    viewportH: window.innerHeight,
    maxTouchPoints: navigator.maxTouchPoints,
    pointer: pointerKind(),
    hover: matchMedia('(hover: hover)').matches,
    penSeen: readPenSeen(),
    standalone: matchMedia('(display-mode: standalone)').matches,
    language: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...gpuInfo(),
    deviceMemoryGb: nav.deviceMemory,
    cores: navigator.hardwareConcurrency,
  }
}

function send(deviceType: () => DeviceType): void {
  try {
    api('POST /api/me/environment', { body: collectEnvironment(deviceType()) })
      .catch(() => {
        // Diagnostics only. A failure here must never surface to the person.
      })
  } catch {
    // Collection and request setup can also fail synchronously.
  }
}

/** Reports once now, and once more the first time a pen with pressure
 *  touches the page — that is the field most worth having and the one a
 *  fresh load cannot know yet. Call after the identity warm-up, so the report
 *  lands on this browser's identity and device cookies.
 *
 *  `deviceType` is asked at each send rather than passed as a value, since the
 *  second report can come much later, and passed in at all rather than read
 *  from settingsStore because this module sits below the stores (#650). */
export function reportEnvironment(deviceType: () => DeviceType): void {
  send(deviceType)
  if (readPenSeen()) return
  // This closure captures no event/canvas; only the existing settings callback.
  const reportPen = () => {
    try {
      localStorage.setItem(PEN_SEEN_KEY, '1')
    } catch {
      // The in-memory fact remains true even when private storage refuses it.
    }
    send(deviceType)
  }
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== 'pen' || event.pressure <= 0) return
    window.removeEventListener('pointerdown', onPointer, true)
    if (penSeenThisPage) return
    penSeenThisPage = true
    // A macrotask, not a microtask: diagnostics must leave input dispatch first.
    try { setTimeout(reportPen, 0) } catch { /* Diagnostics never break input. */ }
  }
  window.addEventListener('pointerdown', onPointer, true)
}
