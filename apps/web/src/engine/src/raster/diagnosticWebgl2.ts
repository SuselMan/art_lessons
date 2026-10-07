/** OFF-only prototype adapter. Native WebGL2 owns every texture and framebuffer;
 * there is no second context, readback, or per-pulse CPU roundtrip. */
const contexts = new WeakMap<WebGLRenderingContext, WebGL2RenderingContext>()
const LUMINANCE = 0x1909, LUMINANCE_ALPHA = 0x190a, ALPHA = 0x1906

export function diagnosticWebgl2Raw(gl: WebGLRenderingContext): WebGL2RenderingContext | null {
  return contexts.get(gl) ?? null
}

export function shaderTo300(source: string, vertex: boolean): string {
  if (/^\s*#version\s+300\s+es/m.test(source)) return source
  if (/\b(gl_FragData|texture2DProj|textureCube)\b/.test(source)) throw new Error('Diagnostic WebGL2 shader syntax outside supported subset')
  let adapted = source.replace(/^\s*#version\s+100\s*$/gm, '')
    .replace(/\battribute\b/g, 'in')
    .replace(/\bvarying\b/g, vertex ? 'out' : 'in')
    .replace(/\btexture2D\b/g, 'texture')
  if (!vertex) adapted = adapted.replace(/\bgl_FragColor\b/g, 'diagnosticRecord')
  return '#version 300 es\n' + (vertex ? '' : 'layout(location=0) out highp vec4 diagnosticRecord;\n') + adapted
}

/** Expands legacy sampling semantics, including aligned source rows. Only
 * Uint8/null uploads are admitted; unsupported overloads fail loudly. */
export function expandLegacyPixels(width: number, height: number, format: number,
  pixels: Uint8Array | null, alignment: number): Uint8Array | null {
  if (pixels === null) return null
  const channels = format === LUMINANCE_ALPHA ? 2 : 1
  const row = width * channels, stride = Math.ceil(row / alignment) * alignment
  if (pixels.byteLength < stride * Math.max(height - 1, 0) + row) throw new Error('Diagnostic legacy upload has insufficient aligned rows')
  const outStride = Math.ceil(width * 4 / alignment) * alignment
  const out = new Uint8Array(outStride * Math.max(height - 1, 0) + width * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * stride + x * channels, j = y * outStride + x * 4
    const luminance = format === ALPHA ? 0 : pixels[i]
    out[j] = luminance; out[j + 1] = luminance; out[j + 2] = luminance
    out[j + 3] = format === ALPHA ? pixels[i] : format === LUMINANCE_ALPHA ? pixels[i + 1] : 255
  }
  return out
}

export function adaptDiagnosticWebgl2(raw: WebGL2RenderingContext): WebGLRenderingContext {
  let alignment = 4
  raw.canvas.addEventListener('webglcontextrestored', () => { alignment = 4 })
  const bound = new Map<PropertyKey, unknown>()
  const overrides: Record<string, unknown> = {
    LUMINANCE, LUMINANCE_ALPHA, ALPHA,
    shaderSource(shader: WebGLShader, source: string) {
      raw.shaderSource(shader, shaderTo300(source, raw.getShaderParameter(shader, raw.SHADER_TYPE) === raw.VERTEX_SHADER))
    },
    pixelStorei(pname: number, value: number) {
      raw.pixelStorei(pname, value)
      if (pname === raw.UNPACK_ALIGNMENT) alignment = value
    },
    getExtension(name: string) {
      if (name === 'EXT_blend_minmax') return { MAX_EXT: raw.MAX, MIN_EXT: raw.MIN }
      if (name === 'ANGLE_instanced_arrays') return {
        vertexAttribDivisorANGLE: raw.vertexAttribDivisor.bind(raw),
        drawArraysInstancedANGLE: raw.drawArraysInstanced.bind(raw),
        drawElementsInstancedANGLE: raw.drawElementsInstanced.bind(raw),
      }
      return raw.getExtension(name)
    },
    texImage2D(...args: unknown[]) {
      const internal = args[2]
      if (internal === LUMINANCE || internal === LUMINANCE_ALPHA || internal === ALPHA) {
        if (args.length !== 9 || args[6] !== internal || args[7] !== raw.UNSIGNED_BYTE || !(args[8] === null || args[8] instanceof Uint8Array)) {
          throw new Error('Diagnostic WebGL2 legacy texImage2D overload unsupported')
        }
        const pixels = expandLegacyPixels(args[3] as number, args[4] as number, internal as number, args[8] as Uint8Array | null, alignment)
        raw.texImage2D(args[0] as number, args[1] as number, raw.RGBA, args[3] as number, args[4] as number, args[5] as number, raw.RGBA, raw.UNSIGNED_BYTE, pixels)
      } else Reflect.apply(raw.texImage2D, raw, args)
    },
    texSubImage2D(...args: unknown[]) {
      const format = args[6]
      if (format === LUMINANCE || format === LUMINANCE_ALPHA || format === ALPHA) {
        if (args.length !== 9 || args[7] !== raw.UNSIGNED_BYTE || !(args[8] instanceof Uint8Array)) throw new Error('Diagnostic WebGL2 legacy texSubImage2D overload unsupported')
        const pixels = expandLegacyPixels(args[4] as number, args[5] as number, format as number, args[8], alignment)
        raw.texSubImage2D(args[0] as number, args[1] as number, args[2] as number, args[3] as number, args[4] as number, args[5] as number, raw.RGBA, raw.UNSIGNED_BYTE, pixels)
      } else Reflect.apply(raw.texSubImage2D, raw, args)
    },
  }
  const proxy = new Proxy(raw, {
    get(target, key) {
      if (typeof key === 'string' && key in overrides) return overrides[key]
      if (bound.has(key)) return bound.get(key)
      const value = Reflect.get(target, key, target)
      if (typeof value !== 'function') return value
      const method = value.bind(target); bound.set(key, method); return method
    },
  }) as unknown as WebGLRenderingContext
  contexts.set(proxy, raw)
  return proxy
}
