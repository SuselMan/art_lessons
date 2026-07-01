import type { PaperType, Dab, ToolType } from '@art-lessons/shared'
import { DAB_VERT, DAB_FRAG, DISPLAY_VERT, DISPLAY_FRAG, LAYER_COMPOSITE_FRAG } from './src/shaders'
import { createProgram, getUniforms, createQuadBuffer, createFullscreenQuad } from './src/utils'
import { createPaperTexture } from './src/PaperTexture'
import { AccumulationBuffer } from './src/AccumulationBuffer'
import { DabSystem } from './src/DabSystem'
import { PointerInput, type PointerData } from './src/PointerInput'

// ─── Public types ──────────────────────────────────────────────────────────────

export interface CompositeItem {
  id: string
  opacity: number
}

export interface PencilEngineOptions {
  paper?: PaperType
  pencilType?: string
  size?: number
  opacity?: number
  paperScale?: number
  graphiteColor?: [number, number, number]
}

type EngineEventName = 'strokeStart' | 'strokeEnd' | 'pointer'
type EngineHandler = (data: PointerData) => void

export interface PencilEngineAPI {
  initLayer(id: string): void
  destroyLayer(id: string): void
  setActiveLayer(id: string): void
  setLocked(locked: boolean): void
  setCompositeOrder(items: CompositeItem[]): void
  mergeLayers(ids: string[]): Uint8Array
  restoreLayerPixels(id: string, pixels: Uint8Array): void
  setPaper(type: PaperType): void
  setPencil(type: string): void
  setTool(tool: ToolType): void
  setOpacity(v: number): void
  setSize(px: number): void
  setViewport(cx: number, cy: number, zoom: number, angle: number): void
  undo(): boolean
  clear(): void
  on(event: EngineEventName, fn: EngineHandler): this
  exportPNG(): Promise<Blob | null>
  destroy(): void
}

// ─── Internal types ────────────────────────────────────────────────────────────

interface PencilPreset { opacity: number; hardness: number; sizeMultiplier: number }
interface EngineOpts {
  paper: PaperType
  pencilType: string
  size: number
  paperScale: number
  graphiteColor: [number, number, number]
  tool: ToolType
  opacity: number
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PENCIL_PRESETS: Record<string, PencilPreset> = {
  'H':  { opacity: 0.32, hardness: 0.55, sizeMultiplier: 0.85 },
  'HB': { opacity: 0.48, hardness: 0.38, sizeMultiplier: 1.00 },
  '2B': { opacity: 0.65, hardness: 0.25, sizeMultiplier: 1.10 },
  '4B': { opacity: 0.80, hardness: 0.14, sizeMultiplier: 1.20 },
  '6B': { opacity: 0.92, hardness: 0.08, sizeMultiplier: 1.35 },
}

const PAPER_COLORS: Record<PaperType, [number, number, number]> = {
  rough:   [0.96, 0.94, 0.90],
  smooth:  [0.97, 0.97, 0.96],
  bristol: [0.99, 0.99, 0.98],
}

const PAPER_ROUGHNESS: Record<PaperType, number> = {
  rough:   1.0,
  smooth:  0.04,
  bristol: 0.005,
}

// ─── Engine ────────────────────────────────────────────────────────────────────

export class PencilEngine implements PencilEngineAPI {
  private canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext
  private _opts: EngineOpts

  // WebGL programs and uniforms — assigned in _initGL()
  private _dabProg!: WebGLProgram
  private _dispProg!: WebGLProgram
  private _compositeProg!: WebGLProgram
  private _dabUni!: Record<string, WebGLUniformLocation | null>
  private _dispUni!: Record<string, WebGLUniformLocation | null>
  private _compositeUni!: Record<string, WebGLUniformLocation | null>
  private _quadBuf!: WebGLBuffer
  private _screenBuf!: WebGLBuffer
  private _compositeFBO!: AccumulationBuffer

  // Paper texture — assigned in _initPaper()
  private _paperTex!: WebGLTexture

  // Layer management
  private _layers: Map<string, AccumulationBuffer>
  private _compositeOrder: CompositeItem[]
  private _activeId: string | null
  private _locked: boolean

  // Undo: per-layer pixel snapshots — only the changed layer is stored each step
  private _undoStack: Array<{ layerId: string; pixels: Uint8Array }>

  private _handlers: Partial<Record<EngineEventName, EngineHandler>>
  private _raf: number
  private _pointer: PointerInput
  private _dabs: DabSystem

  constructor(canvas: HTMLCanvasElement, options: PencilEngineOptions = {}) {
    this.canvas = canvas

    const gl = canvas.getContext('webgl', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
    })
    if (!gl) throw new Error('WebGL not supported')
    this.gl = gl

    this._opts = {
      paper:         options.paper         ?? 'rough',
      pencilType:    options.pencilType    ?? 'HB',
      size:          options.size          ?? 24,
      paperScale:    options.paperScale    ?? 1.0,
      graphiteColor: options.graphiteColor ?? [0.14, 0.14, 0.17],
      tool:          'pencil',
      opacity:       options.opacity       ?? 1.0,
    }

    this._initGL()
    this._initPaper(this._opts.paper)
    this._pointer = new PointerInput(canvas)
    this._dabs    = new DabSystem()

    this._layers         = new Map()
    this._compositeOrder = []
    this._activeId       = null
    this._locked         = false
    this._undoStack      = []
    this._handlers       = {}

    this._pointer
      .on('start', e => this._onStart(e))
      .on('move',  e => this._onMove(e))
      .on('end',   e => this._onEnd(e))

    this._raf = requestAnimationFrame(() => this._display())
  }

  // ─── Layer API ───────────────────────────────────────────────────────────────

  initLayer(id: string): void {
    const { gl, canvas } = this
    const buf = new AccumulationBuffer(gl, canvas.width, canvas.height)
    buf.clear()
    this._layers.set(id, buf)
  }

  destroyLayer(id: string): void {
    const buf = this._layers.get(id)
    if (buf) { buf.destroy(); this._layers.delete(id) }
    // Remove pending undo entries so we don't reference dead buffers
    this._undoStack = this._undoStack.filter(e => e.layerId !== id)
  }

  setActiveLayer(id: string): void {
    this._activeId = id
  }

  setLocked(locked: boolean): void {
    this._locked = locked
  }

  setCompositeOrder(items: CompositeItem[]): void {
    this._compositeOrder = items
    this._display()
  }

  mergeLayers(ids: string[]): Uint8Array {
    const { gl, canvas } = this
    const idSet = new Set(ids)
    const toMerge = this._compositeOrder.filter(item => idSet.has(item.id))

    const temp = new AccumulationBuffer(gl, canvas.width, canvas.height)
    temp.clear()
    this._runComposite(toMerge, temp.fbo)

    const pixels = temp.readPixels()
    temp.destroy()
    return pixels
  }

  restoreLayerPixels(id: string, pixels: Uint8Array): void {
    this._layers.get(id)?.restorePixels(pixels)
  }

  // ─── Tool API ────────────────────────────────────────────────────────────────

  setPaper(type: PaperType): void {
    this._opts.paper = type
    this._initPaper(type)
    this._display()
  }

  setPencil(type: string): void  { this._opts.pencilType = type }
  setTool(tool: ToolType): void  { this._opts.tool = tool }
  setOpacity(v: number): void    { this._opts.opacity = v }
  setSize(px: number): void      { this._opts.size = px }

  setViewport(cx: number, cy: number, zoom: number, angle: number): void {
    const { canvas } = this
    const cos = Math.cos(-angle)
    const sin = Math.sin(-angle)
    const hw  = canvas.width  / 2
    const hh  = canvas.height / 2
    this._pointer.setTransform((clientX, clientY) => {
      const dx = clientX - cx
      const dy = clientY - cy
      const rx = dx * cos - dy * sin
      const ry = dx * sin + dy * cos
      return { x: rx / zoom + hw, y: ry / zoom + hh }
    })
  }

  undo(): boolean {
    if (!this._undoStack.length) return false
    const { layerId, pixels } = this._undoStack.pop()!
    const buf = this._layers.get(layerId)
    if (!buf) return false // layer was deleted after the stroke
    buf.restorePixels(pixels)
    this._display()
    return true
  }

  clear(): void {
    const buf = this._layers.get(this._activeId ?? '')
    if (!buf) return
    this._saveSnapshot()
    buf.clear()
    this._display()
  }

  on(event: EngineEventName, fn: EngineHandler): this {
    this._handlers[event] = fn
    return this
  }

  exportPNG(): Promise<Blob | null> {
    this._display()
    return new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'))
  }

  destroy(): void {
    cancelAnimationFrame(this._raf)
    this._pointer.destroy()
    this._layers.forEach(buf => buf.destroy())
    this._compositeFBO.destroy()
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private _initGL(): void {
    const { gl, canvas } = this

    this._dabProg       = createProgram(gl, DAB_VERT, DAB_FRAG)
    this._dispProg      = createProgram(gl, DISPLAY_VERT, DISPLAY_FRAG)
    this._compositeProg = createProgram(gl, DISPLAY_VERT, LAYER_COMPOSITE_FRAG)

    this._dabUni  = getUniforms(gl, this._dabProg, [
      'u_dabCenter', 'u_dabRadius', 'u_angle', 'u_aspectRatio',
      'u_resolution', 'u_paperHeightMap', 'u_paperScale',
      'u_pressure', 'u_tiltX', 'u_tiltY', 'u_hardness', 'u_opacity',
      'u_paperRoughness', 'u_eraseMode',
    ])
    this._dispUni = getUniforms(gl, this._dispProg, [
      'u_accumulation', 'u_paperMap', 'u_paperColor', 'u_graphiteColor', 'u_paperScale',
    ])
    this._compositeUni = getUniforms(gl, this._compositeProg, ['u_layer', 'u_opacity'])

    this._quadBuf   = createQuadBuffer(gl)
    this._screenBuf = createFullscreenQuad(gl)

    this._compositeFBO = new AccumulationBuffer(gl, canvas.width, canvas.height)
  }

  private _initPaper(type: PaperType): void {
    const { gl, canvas } = this
    if (this._paperTex) gl.deleteTexture(this._paperTex)
    this._paperTex = createPaperTexture(gl, type, canvas.width, canvas.height)
  }

  private get _physicalSize(): number {
    return this._opts.size * (this.canvas.width / (this.canvas.clientWidth || this.canvas.width))
  }

  private _saveSnapshot(): void {
    if (!this._activeId) return
    const buf = this._layers.get(this._activeId)
    if (!buf) return
    this._undoStack.push({ layerId: this._activeId, pixels: buf.readPixels() })
    if (this._undoStack.length > 30) this._undoStack.shift()
  }

  private _onStart(e: PointerData): void {
    if (this._locked) return
    this._saveSnapshot()
    const dabs = this._dabs.startStroke(e.x, e.y, e.pressure, e.tiltX, e.tiltY, this._physicalSize)
    this._renderDabs(dabs, e)
    this._display()
    this._handlers.strokeStart?.(e)
  }

  private _onMove(e: PointerData): void {
    this._handlers.pointer?.(e)
    if (this._locked) return
    const dabs = this._dabs.continueStroke(e.x, e.y, e.pressure, e.tiltX, e.tiltY, this._physicalSize)
    if (dabs.length) { this._renderDabs(dabs, e); this._display() }
  }

  private _onEnd(e: PointerData): void {
    if (this._locked) return
    const dabs = this._dabs.endStroke(this._physicalSize)
    if (dabs.length) { this._renderDabs(dabs, e); this._display() }
    this._handlers.strokeEnd?.(e)
  }

  private _renderDabs(dabs: Dab[], pointerState: PointerData): void {
    const { gl, canvas } = this
    const erasing     = this._opts.tool === 'eraser'
    const userOpacity = this._opts.opacity
    const preset      = PENCIL_PRESETS[this._opts.pencilType] ?? PENCIL_PRESETS['HB']

    const buf = this._layers.get(this._activeId ?? '')
    if (!buf) return
    if (erasing) {
      buf.beginErase()
    } else {
      buf.beginDraw()
    }

    gl.useProgram(this._dabProg)
    const u = this._dabUni
    const w = canvas.width, h = canvas.height

    gl.uniform2f(u.u_resolution, w, h)
    gl.uniform2f(u.u_paperScale, this._opts.paperScale, this._opts.paperScale)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._paperTex)
    gl.uniform1i(u.u_paperHeightMap, 0)
    gl.uniform1f(u.u_hardness, erasing ? 0.85 : preset.hardness)
    gl.uniform1f(u.u_paperRoughness, PAPER_ROUGHNESS[this._opts.paper] ?? 1.0)
    gl.uniform1f(u.u_eraseMode, erasing ? 1.0 : 0.0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf)
    const posLoc = gl.getAttribLocation(this._dabProg, 'a_position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    for (const dab of dabs) {
      const speedFactor = Math.max(0.7, 1.0 - pointerState.speed * 0.15)
      const dabOpacity  = erasing
        ? userOpacity
        : preset.opacity * userOpacity * speedFactor

      gl.uniform2f(u.u_dabCenter, dab.x, dab.y)
      gl.uniform1f(u.u_dabRadius, dab.size * 0.5 * (erasing ? 1.0 : preset.sizeMultiplier))
      gl.uniform1f(u.u_angle,      dab.angle)
      gl.uniform1f(u.u_aspectRatio, dab.aspectRatio)
      gl.uniform1f(u.u_pressure,   dab.pressure)
      gl.uniform1f(u.u_tiltX,      dab.tiltX)
      gl.uniform1f(u.u_tiltY,      dab.tiltY)
      gl.uniform1f(u.u_opacity,    dabOpacity)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    buf.endDraw()
  }

  private _runComposite(items: CompositeItem[], targetFbo: WebGLFramebuffer): void {
    const { gl, canvas } = this
    const w = canvas.width, h = canvas.height

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo)
    gl.viewport(0, 0, w, h)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    gl.useProgram(this._compositeProg)
    const cu = this._compositeUni

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = gl.getAttribLocation(this._compositeProg, 'a_position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    for (const { id, opacity } of items) {
      const buf = this._layers.get(id)
      if (!buf) continue
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, buf.texture)
      gl.uniform1i(cu.u_layer, 0)
      gl.uniform1f(cu.u_opacity, opacity)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    gl.disable(gl.BLEND)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private _display(): void {
    const { gl, canvas } = this
    const w = canvas.width, h = canvas.height

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._compositeFBO.fbo)
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    this._runComposite(this._compositeOrder, this._compositeFBO.fbo)

    const paperColor    = PAPER_COLORS[this._opts.paper]
    const graphiteColor = this._opts.graphiteColor

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, w, h)
    gl.disable(gl.BLEND)

    gl.useProgram(this._dispProg)
    const u = this._dispUni

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._compositeFBO.texture)
    gl.uniform1i(u.u_accumulation, 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this._paperTex)
    gl.uniform1i(u.u_paperMap, 1)

    gl.uniform3fv(u.u_paperColor,    paperColor)
    gl.uniform3fv(u.u_graphiteColor, graphiteColor)
    gl.uniform2f(u.u_paperScale, this._opts.paperScale, this._opts.paperScale)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = gl.getAttribLocation(this._dispProg, 'a_position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }
}
