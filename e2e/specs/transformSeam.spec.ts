import { expect, test } from '@playwright/test'

/** (#507) The seam a tiled layer transform used to leave along every
 *  source-tile boundary, measured on a real GPU.
 *
 *  Why this shape, and not "drag a layer in the app and look at it": the
 *  defect is a property of one draw call's filtering, and it is one texel
 *  wide. Reproducing it through the UI means getting a tile boundary on
 *  screen, drawing content whose untransformed value is known to the pixel,
 *  and then telling a real seam apart from the ordinary softness of a
 *  resampled pencil stroke — three sources of flakiness stacked on top of the
 *  one fact under test. So this drives the engine's own shader directly, with
 *  the exact destination<-source composition previewLayerTransform and
 *  _bakeTransform build, over content whose correct resample is arithmetic.
 *  The other half of the fix — that the engine actually blends those passes
 *  additively and point-samples their sources — is asserted against recorded
 *  GL state in apps/web/src/engine/index.tiledTransformSeams.test.ts, which
 *  MockGL can do and this cannot.
 *
 *  It still has to be a browser: MockGL never rasterizes, and the whole claim
 *  here is about what a rasterizer does at a texture's edge. The page is only
 *  here to be a WebGL context and a module server — no room, no server state.
 */
test.describe('a tiled layer resamples as one image (#507)', () => {
  test('no source-tile boundary shows through a resampling transform', async ({ page }) => {
    await page.goto('/')

    const result = await page.evaluate(async () => {
      // Through a variable so this stays a runtime URL: the dev server
      // resolves it, `tsc -p tsconfig.e2e.json` has no idea what a Vite root
      // is and would fail on the literal.
      const shadersUrl = '/src/engine/src/shaders.ts'
      const { DISPLAY_VERT, TRANSFORM_BLIT_FRAG } = await import(shadersUrl) as {
        DISPLAY_VERT: string; TRANSFORM_BLIT_FRAG: string
      }
      const S = 256 // stands in for TILE_SIZE; the math is scale-free

      const canvas = document.createElement('canvas')
      canvas.width = S; canvas.height = S
      const gl = canvas.getContext('webgl', { premultipliedAlpha: true })
      if (!gl) return { error: 'no webgl context', renderer: '', cases: [] }

      const compile = (type: number, source: string) => {
        const sh = gl.createShader(type)!
        gl.shaderSource(sh, source); gl.compileShader(sh)
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'compile failed')
        return sh
      }
      const prog = gl.createProgram()!
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, DISPLAY_VERT))
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, TRANSFORM_BLIT_FRAG))
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link failed')

      const quad = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, quad)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)

      // One world-space pattern split across two tiles, tile A at world x 0
      // and tile B at world x S. Vertical stripes with a two-pixel period:
      // the frequency at which "bilinear or nearest" differs most, and a fair
      // stand-in for pencil grain. Opaque and premultiplied, like every
      // accumulation buffer this shader really reads.
      const pattern = (worldX: number) => (worldX % 2 === 0 ? 255 : 0)
      const makeTile = (originX: number) => {
        const data = new Uint8Array(S * S * 4)
        for (let row = 0; row < S; row++) {
          for (let x = 0; x < S; x++) {
            const v = pattern(originX + x)
            const i = (row * S + x) * 4
            data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255
          }
        }
        const tex = gl.createTexture()!
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
        // NEAREST and CLAMP_TO_EDGE: exactly what _runTransformBlit puts the
        // source on for the draw (AccumulationBuffer.setPointSampling).
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        return tex
      }
      const tiles: Array<[WebGLTexture, number]> = [[makeTile(0), 0], [makeTile(S), S]]

      const dest = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, dest)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      const fbo = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dest, 0)
      const posLoc = gl.getAttribLocation(prog, 'a_position')

      /** The forward transform is world -> world: `x * scale + offset`. The
       *  destination is tile 1 of the same grid, world [S, 2S), so the source
       *  seam at world S shows up wherever the transform sends it. */
      const run = (scale: number, offset: number) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
        gl.viewport(0, 0, S, S)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        for (const [tex, srcOrigin] of tiles) {
          // dest-tile-local -> world -> pre-transform world -> src-tile-local:
          // the same composition previewLayerTransform builds per (dest, src)
          // pair. Column-major, as WebGL wants it.
          const a = 1 / scale
          const tx = (S - offset) / scale - srcOrigin
          gl.enable(gl.BLEND)
          gl.blendFunc(gl.ONE, gl.ONE) // 'add' — the tiled-source mode
          gl.useProgram(prog)
          gl.bindBuffer(gl.ARRAY_BUFFER, quad)
          gl.enableVertexAttribArray(posLoc)
          gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, tex)
          gl.uniform1i(gl.getUniformLocation(prog, 'u_source'), 0)
          gl.uniform2f(gl.getUniformLocation(prog, 'u_dstSize'), S, S)
          gl.uniform2f(gl.getUniformLocation(prog, 'u_srcSize'), S, S)
          gl.uniformMatrix3fv(gl.getUniformLocation(prog, 'u_matrixInv'), false,
            new Float32Array([a, 0, 0, 0, a, 0, tx, 0, 1]))
          gl.drawArrays(gl.TRIANGLES, 0, 6)
          gl.disable(gl.BLEND)
        }
        const px = new Uint8Array(S * S * 4)
        gl.readPixels(0, 0, S, S, gl.RGBA, gl.UNSIGNED_BYTE, px)

        // What the same transform of the same pattern as one *untiled* image
        // would have produced. Plain arithmetic — no second GPU path to be
        // wrong in the same way.
        const row = S >> 1
        let worst = 0, worstAt = -1
        for (let x = 2; x < S - 2; x++) {
          const srcX = (S + x + 0.5 - offset) / scale
          const p = srcX - 0.5
          const base = Math.floor(p), f = p - base
          const at = (i: number) => (i >= 0 && i < 2 * S ? pattern(i) : 0)
          const want = at(base) * (1 - f) + at(base + 1) * f
          const got = px[(row * S + x) * 4]
          const d = Math.abs(got - want)
          if (d > worst) { worst = d; worstAt = x }
        }
        return { scale, offset, worst: Math.round(worst), worstAt }
      }

      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      return {
        error: undefined as string | undefined,
        renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown',
        cases: [
          run(1, 128),      // exact integer move: lands on texel centres, always was clean
          run(1, 128.5),    // half a pixel: the worst case, and the common one
          run(1, 128.25),
          run(3, -400.5),   // scaled up, where one bad source texel becomes a three-pixel band
          run(1.37, 60.2),  // an arbitrary gizmo drag
        ],
      }
    })

    expect(result.error).toBeUndefined()
    // A software rasteriser would make "what does the GPU do at a texture
    // edge" a question about something else entirely — see playwright.config.
    expect(result.renderer).not.toMatch(/swiftshader|llvmpipe/i)
    expect(result.cases).toHaveLength(5)

    for (const c of result.cases) {
      // 1 is 8-bit rounding. The bug was 128 — half the pattern's contrast,
      // in a single column, exactly where the two source tiles meet.
      expect(c.worst, `scale ${c.scale}, offset ${c.offset}: worst deviation at x=${c.worstAt}`)
        .toBeLessThanOrEqual(1)
    }
  })
})
