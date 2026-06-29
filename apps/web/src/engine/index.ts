import { DAB_VERT, DAB_FRAG, DISPLAY_VERT, DISPLAY_FRAG } from './src/shaders';
import { createProgram, getUniforms, createQuadBuffer, createFullscreenQuad } from './src/utils';
import { createPaperTexture } from './src/PaperTexture';
import { AccumulationBuffer } from './src/AccumulationBuffer';
import { DabSystem } from './src/DabSystem';
import { PointerInput } from './src/PointerInput';

// Pencil presets: [baseOpacity, hardness, maxDark, sizeMultiplier]
const PENCIL_PRESETS = {
  'H':  { opacity: 0.32, hardness: 0.55, sizeMultiplier: 0.85 },
  'HB': { opacity: 0.48, hardness: 0.38, sizeMultiplier: 1.00 },
  '2B': { opacity: 0.65, hardness: 0.25, sizeMultiplier: 1.10 },
  '4B': { opacity: 0.80, hardness: 0.14, sizeMultiplier: 1.20 },
  '6B': { opacity: 0.92, hardness: 0.08, sizeMultiplier: 1.35 },
};

const PAPER_COLORS = {
  rough:   [0.96, 0.94, 0.90],
  smooth:  [0.97, 0.97, 0.96],
  bristol: [0.99, 0.99, 0.98],
};

// Controls how much paper grain shows through in the pencil stroke itself.
// 1.0 = strong grain (peaks only catch graphite), 0.0 = uniform fill (smooth surface)
const PAPER_ROUGHNESS = {
  rough:   1.0,
  smooth:  0.04,
  bristol: 0.005,
};

export class PencilEngine {
  constructor(canvas, options = {}) {
    this.canvas = canvas;

    const gl = canvas.getContext('webgl', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
    });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;

    this._opts = {
      paper:       options.paper        ?? 'rough',
      pencilType:  options.pencilType   ?? 'HB',
      size:        options.size         ?? 24,
      paperScale:  options.paperScale   ?? 1.0,
      graphiteColor: options.graphiteColor ?? [0.14, 0.14, 0.17],
    };

    this._initGL();
    this._initPaper(this._opts.paper);
    this._pointer = new PointerInput(canvas);
    this._dabs    = new DabSystem();
    this._strokes = []; // for future undo replay

    this._pointer
      .on('start', e => this._onStart(e))
      .on('move',  e => this._onMove(e))
      .on('end',   e => this._onEnd(e));

    this._raf = requestAnimationFrame(() => this._display());

    this._handlers = {};
  }

  // --- public API ---

  setPaper(type) {
    this._opts.paper = type;
    this._initPaper(type);
    this._display();
  }

  setPencil(type) {
    this._opts.pencilType = type;
  }

  setSize(px) { this._opts.size = px; }

  undo() {
    const ok = this._accum.undo();
    if (ok) this._display();
    return ok;
  }

  clear() {
    this._accum.clear();
    this._display();
  }

  on(event, fn) { this._handlers[event] = fn; return this; }

  exportPNG() {
    this._display();
    return new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'));
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this._pointer.destroy();
    this._accum.destroy();
  }

  // --- internal ---

  _initGL() {
    const { gl, canvas } = this;

    // Programs
    this._dabProg  = createProgram(gl, DAB_VERT, DAB_FRAG);
    this._dispProg = createProgram(gl, DISPLAY_VERT, DISPLAY_FRAG);

    this._dabUni  = getUniforms(gl, this._dabProg, [
      'u_dabCenter', 'u_dabRadius', 'u_angle', 'u_aspectRatio',
      'u_resolution', 'u_paperHeightMap', 'u_paperScale',
      'u_pressure', 'u_tiltX', 'u_tiltY', 'u_hardness', 'u_opacity',
      'u_paperRoughness',
    ]);
    this._dispUni = getUniforms(gl, this._dispProg, [
      'u_accumulation', 'u_paperMap', 'u_paperColor',
      'u_graphiteColor', 'u_paperScale',
    ]);

    this._quadBuf  = createQuadBuffer(gl);
    this._screenBuf = createFullscreenQuad(gl);

    this._accum = new AccumulationBuffer(gl, canvas.width, canvas.height);
    this._accum.clear();
  }

  _initPaper(type) {
    const { gl, canvas } = this;
    if (this._paperTex) gl.deleteTexture(this._paperTex);
    // Generate at canvas physical resolution — no tiling, no repeating pattern
    this._paperTex = createPaperTexture(gl, type, canvas.width, canvas.height);
  }

  // Size in CSS px → physical px (matches pointer coordinate space)
  get _physicalSize() {
    return this._opts.size * (this.canvas.width / this.canvas.clientWidth || 1);
  }

  _onStart(e) {
    this._accum.saveSnapshot();
    const dabs = this._dabs.startStroke(e.x, e.y, e.pressure, e.tiltX, e.tiltY, this._physicalSize);
    this._renderDabs(dabs, e);
    this._display();
    this._handlers.strokeStart?.(e);
  }

  _onMove(e) {
    const dabs = this._dabs.continueStroke(e.x, e.y, e.pressure, e.tiltX, e.tiltY, this._physicalSize);
    if (dabs.length) {
      this._renderDabs(dabs, e);
      this._display();
    }
    this._handlers.pointer?.(e);
  }

  _onEnd(e) {
    // Flush the last pending segment (1-event lag of Catmull-Rom)
    const dabs = this._dabs.endStroke(this._physicalSize);
    if (dabs.length) {
      this._renderDabs(dabs, e);
      this._display();
    }
    this._handlers.strokeEnd?.(e);
  }

  _renderDabs(dabs, pointerState) {
    const { gl, canvas } = this;
    const preset = PENCIL_PRESETS[this._opts.pencilType] ?? PENCIL_PRESETS['HB'];

    this._accum.beginDraw();

    gl.useProgram(this._dabProg);
    const u = this._dabUni;
    const w = canvas.width, h = canvas.height;

    gl.uniform2f(u.u_resolution, w, h);
    gl.uniform2f(u.u_paperScale,
      this._opts.paperScale,
      this._opts.paperScale,
    );

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._paperTex);
    gl.uniform1i(u.u_paperHeightMap, 0);

    gl.uniform1f(u.u_hardness, preset.hardness);
    gl.uniform1f(u.u_paperRoughness, PAPER_ROUGHNESS[this._opts.paper] ?? 1.0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf);
    const posLoc = gl.getAttribLocation(this._dabProg, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    for (const dab of dabs) {
      // Speed-based opacity: faster strokes are slightly lighter (subtle, max 30% reduction)
      const speedFactor = pointerState?.speed != null
        ? Math.max(0.7, 1.0 - pointerState.speed * 0.15)
        : 1.0;

      gl.uniform2f(u.u_dabCenter, dab.x, dab.y); // CSS coords, shader flips Y
      gl.uniform1f(u.u_dabRadius, dab.size * 0.5 * preset.sizeMultiplier);
      gl.uniform1f(u.u_angle,     dab.angle);
      gl.uniform1f(u.u_aspectRatio, dab.aspectRatio);
      gl.uniform1f(u.u_pressure, dab.pressure);
      gl.uniform1f(u.u_tiltX,    dab.tiltX);
      gl.uniform1f(u.u_tiltY,    dab.tiltY);
      gl.uniform1f(u.u_opacity,  preset.opacity * speedFactor);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    this._accum.endDraw();
  }

  _display() {
    const { gl, canvas } = this;
    const w = canvas.width, h = canvas.height;
    const paperColor = PAPER_COLORS[this._opts.paper] ?? PAPER_COLORS.rough;
    const graphiteColor = this._opts.graphiteColor;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);

    gl.useProgram(this._dispProg);
    const u = this._dispUni;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accum.texture);
    gl.uniform1i(u.u_accumulation, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._paperTex);
    gl.uniform1i(u.u_paperMap, 1);

    gl.uniform3fv(u.u_paperColor,   paperColor);
    gl.uniform3fv(u.u_graphiteColor, graphiteColor);
    gl.uniform2f(u.u_paperScale,
      this._opts.paperScale,
      this._opts.paperScale,
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf);
    const posLoc = gl.getAttribLocation(this._dispProg, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
