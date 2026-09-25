import type { ClientEnvironment } from '@grafetto/shared'

import { apiFetch } from './api'
import { APP_VERSION } from './appVersion'
import { DEVICE_TYPE_STORAGE_KEY, useSettingsStore } from '../stores/settingsStore'

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

function readPenSeen(): boolean {
  try {
    return localStorage.getItem(PEN_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function gpuInfo(): Pick<ClientEnvironment, 'webgl' | 'gpuVendor' | 'gpuRenderer' | 'maxTextureSize'> {
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

export function collectEnvironment(): ClientEnvironment {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return {
    appVersion: APP_VERSION,
    deviceType: useSettingsStore.getState().deviceType,
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

function send(): void {
  apiFetch('/api/me/environment', { method: 'POST', body: JSON.stringify(collectEnvironment()) })
    .catch(() => {
      // Diagnostics only. A failure here must never surface to the person.
    })
}

/** Reports once now, and once more the first time a pen with pressure
 *  touches the page — that is the field most worth having and the one a
 *  fresh load cannot know yet. Call after the identity warm-up, so the report
 *  lands on this browser's identity and device cookies. */
export function reportEnvironment(): void {
  send()
  if (readPenSeen()) return
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== 'pen' || event.pressure <= 0) return
    window.removeEventListener('pointerdown', onPointer, true)
    try {
      localStorage.setItem(PEN_SEEN_KEY, '1')
    } catch {
      // Private mode: this load still reports it, the next one asks again.
    }
    send()
  }
  window.addEventListener('pointerdown', onPointer, true)
}
