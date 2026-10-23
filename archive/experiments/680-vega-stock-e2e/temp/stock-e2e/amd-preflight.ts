import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
export default async function () {
  if (process.env.E2E_GPU_SLOT !== 'granted') throw new Error('Root GPU slot required')
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist'] })
  try {
    const page = await browser.newPage()
    const passport = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl')
      if (!gl) throw new Error('WebGL unavailable')
      const debug = gl.getExtension('WEBGL_debug_renderer_info')
      const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : ''
      const vendor = debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : ''
      return { renderer, vendor, ua: navigator.userAgent, maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE), error: gl.getError() }
    })
    writeFileSync('temp/stock-e2e/renderer.json', JSON.stringify(passport, null, 2))
    if (!/AMD|Radeon|Vega/i.test(passport.renderer) || /SwiftShader|llvmpipe|software/i.test(passport.renderer) || passport.error) throw new Error('Actual AMD GPU required: ' + passport.renderer)
  } finally { await browser.close() }
}
