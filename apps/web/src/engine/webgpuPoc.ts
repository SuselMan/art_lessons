/// <reference types="@webgpu/types" />
/** Dev-only experimental backend, deliberately outside PencilEngineAPI. */
import { checkCanonicalBrush } from './src/webgpu/canonicalBrush'
import { SOLVER_WGSL, DISPLAY_WGSL } from './src/webgpu/shaders'
import { GPU_GRID, makePocPaper, oracleFixture, transportStep } from './src/webgpu/model'
import { makeWetGrid, wetDiffuseStepMany } from './src/watercolor/wetDiffusion'
export { GPU_WORLD, GPU_GRID, makeDab, packGpuDabs, pocPreset } from './src/webgpu/model'
export type { GpuStroke, BrushOptions, InputPoint } from './src/webgpu/model'

declare global { interface Window { __watercolorGpuPoc?: WatercolorGpuPoc } }

export interface GpuPocMetrics {
  submissions: number; solverSteps: number; dabs: number; cpuSubmitMs: number;
  gpuMs: number | null; gpuTimer: boolean; adapter: string; memoryBytes: number;
}
export class WatercolorGpuPoc {
  readonly metrics: GpuPocMetrics
  private device: GPUDevice
  private format: GPUTextureFormat
  private context: GPUCanvasContext
  private cells: [GPUBuffer, GPUBuffer]
  private paper: GPUBuffer
  private dabBuffer: GPUBuffer
  private params: GPUBuffer
  private view: GPUBuffer
  private layout: GPUBindGroupLayout
  private deposit: GPUComputePipeline
  private evolve: GPUComputePipeline
  private display: GPURenderPipeline
  private query: GPUQuerySet | null = null
  private queryResult: GPUBuffer | null = null
  private queryRead: GPUBuffer | null = null
  private timerPending = false
  private tickPending = false
  private gpuSamples: number[] = []
  private index = 0
  private solverTick = 0
  private dead = false
  private resources: GPUBuffer[] = []
  private constructor(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat, adapter: GPUAdapter, onError: (message: string) => void) {
    this.device = device; this.context = context; this.format = format
    const count = GPU_GRID.width * GPU_GRID.height
    const buffer = (label: string, size: number, usage: GPUBufferUsageFlags) => {
      const b = device.createBuffer({ label, size, usage }); this.resources.push(b); return b
    }
    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    this.cells = [buffer('Water/pigment A', count * 64, storage), buffer('Water/pigment B', count * 64, storage)]
    this.paper = buffer('Paper height', count * 4, storage)
    device.queue.writeBuffer(this.paper, 0, makePocPaper(GPU_GRID.width, GPU_GRID.height))
    this.dabBuffer = buffer('Dab batch', 64 * 64, storage)
    this.params = buffer('Solver params', 48, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)
    this.view = buffer('Display params', 16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)
    device.queue.writeBuffer(this.view, 0, new Uint32Array([GPU_GRID.width, GPU_GRID.height, 0, 0]))
    this.layout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ] })
    const solver = device.createShaderModule({ label: 'Watercolor compute', code: SOLVER_WGSL })
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] })
    this.deposit = device.createComputePipeline({ label: 'Deposit', layout: pipelineLayout, compute: { module: solver, entryPoint: 'deposit' } })
    this.evolve = device.createComputePipeline({ label: 'Wet transport and drying', layout: pipelineLayout, compute: { module: solver, entryPoint: 'evolve' } })
    const screen = device.createShaderModule({ label: 'Optical-depth display', code: DISPLAY_WGSL })
    this.display = device.createRenderPipeline({ label: 'Paper display', layout: 'auto', vertex: { module: screen, entryPoint: 'vs' }, fragment: { module: screen, entryPoint: 'fs', targets: [{ format }] }, primitive: { topology: 'triangle-list' } })
    if (device.features.has('timestamp-query')) {
      this.query = device.createQuerySet({ type: 'timestamp', count: 2 })
      this.queryResult = buffer('Timestamp resolve', 16, GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC)
      this.queryRead = buffer('Timestamp readback', 16, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ)
    }
    this.metrics = { submissions: 0, solverSteps: 0, dabs: 0, cpuSubmitMs: 0, gpuMs: null, gpuTimer: !!this.query, adapter: [adapter.info.vendor, adapter.info.architecture, adapter.info.device, adapter.info.description].filter(Boolean).join(' / '), memoryBytes: this.resources.reduce((n, b) => n + b.size, 0) }
    device.addEventListener('uncapturederror', event => { console.error('WebGPU:', event.error.message); onError(event.error.message) })
    void device.lost.then(info => { if (!this.dead) onError(`WebGPU device lost: ${info.reason} ${info.message}`) })
    void solver.getCompilationInfo().then(info => { for (const m of info.messages) if (m.type === 'error') onError(`WGSL ${m.lineNum}:${m.linePos}: ${m.message}`) })
  }
  static async create(canvas: HTMLCanvasElement, onError: (message: string) => void) {
    if (!isSecureContext) throw new Error('WebGPU requires a trusted HTTPS origin or localhost.')
    if (!navigator.gpu) throw new Error('WebGPU is unavailable in this browser. No WebGL fallback is used.')
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) throw new Error('No WebGPU adapter is available.')
    const features: GPUFeatureName[] = adapter.features.has('timestamp-query') ? ['timestamp-query'] : []
    const device = await adapter.requestDevice({ requiredFeatures: features })
    const context = canvas.getContext('webgpu')
    if (!context) { device.destroy(); throw new Error('Unable to create a WebGPU canvas.') }
    const format = navigator.gpu.getPreferredCanvasFormat()
    canvas.width = 1024; canvas.height = 768
    context.configure({ device, format, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC })
    device.pushErrorScope('validation')
    const engine = new WatercolorGpuPoc(device, context, format, adapter, onError)
    const validation = await device.popErrorScope()
    if (validation) { engine.destroy(); throw new Error(validation.message) }
    engine.draw(); return engine
  }
  get tickCount() { return this.solverTick }
  get canStep() { return !this.dead && !this.tickPending }
  async whenIdle() { await this.device.queue.onSubmittedWorkDone() }
  get timingSummary() {
    const sorted = this.gpuSamples.toSorted((a, b) => a - b)
    return { count: sorted.length, medianMs: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null, p95Ms: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : null }
  }
  private bind() {
    return this.device.createBindGroup({ layout: this.layout, entries: [
      { binding: 0, resource: { buffer: this.cells[this.index] } },
      { binding: 1, resource: { buffer: this.cells[1 - this.index] } },
      { binding: 2, resource: { buffer: this.paper } },
      { binding: 3, resource: { buffer: this.dabBuffer } },
      { binding: 4, resource: { buffer: this.params } },
    ] })
  }
  private parameters(count: number, dt: number, dry: boolean, bounds: [number, number, number, number], transport = { radius: 1, knight: false }) {
    const data = new ArrayBuffer(48), u = new Uint32Array(data), f = new Float32Array(data)
    u.set([GPU_GRID.width, GPU_GRID.height, count, 0]); f.set([dt, dry ? 1 : 0, transport.radius, transport.knight ? 1 : 0], 4); u.set(bounds, 8)
    this.device.queue.writeBuffer(this.params, 0, data)
  }
  addDabs(data: Float32Array) {
    if (this.dead || !data.length) return
    if (data.length % 16 || data.length > 64 * 16) throw new Error('Dab batch must contain 1–64 records.')
    const start = performance.now()
    this.device.queue.writeBuffer(this.dabBuffer, 0, data)
    let x0: number = GPU_GRID.width, y0: number = GPU_GRID.height, x1 = 0, y1 = 0
    for (let k = 0; k < data.length; k += 16) {
      const extent = Math.max(data[k + 2] * data[k + 4], data[k + 2]) + 2
      x0 = Math.min(x0, Math.floor(data[k] - extent)); y0 = Math.min(y0, Math.floor(data[k + 1] - extent))
      x1 = Math.max(x1, Math.ceil(data[k] + extent)); y1 = Math.max(y1, Math.ceil(data[k + 1] + extent))
    }
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(GPU_GRID.width, x1); y1 = Math.min(GPU_GRID.height, y1)
    if (x1 <= x0 || y1 <= y0) return
    this.parameters(data.length / 16, 0, false, [x0, y0, x1, y1])
    const encoder = this.device.createCommandEncoder({ label: 'Dab batch' })
    const pass = encoder.beginComputePass(); pass.setPipeline(this.deposit); pass.setBindGroup(0, this.bind())
    pass.dispatchWorkgroups(Math.ceil((x1 - x0) / 8), Math.ceil((y1 - y0) / 8)); pass.end()
    this.device.queue.submit([encoder.finish()]); this.metrics.submissions++; this.metrics.dabs += data.length / 16
    this.metrics.cpuSubmitMs += performance.now() - start
  }
  step(dt = 1 / 60, dry = false, transport = transportStep(this.solverTick)) {
    if (this.dead) return
    const start = performance.now()
    this.parameters(0, dt, dry, [0, 0, GPU_GRID.width, GPU_GRID.height], transport)
    this.solverTick++
    const encoder = this.device.createCommandEncoder({ label: 'Watercolor tick' })
    const timed = !!this.query && !this.timerPending
    const pass = encoder.beginComputePass(timed ? { timestampWrites: { querySet: this.query!, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {})
    pass.setPipeline(this.evolve); pass.setBindGroup(0, this.bind()); pass.dispatchWorkgroups(Math.ceil(GPU_GRID.width / 8), Math.ceil(GPU_GRID.height / 8)); pass.end()
    this.index = 1 - this.index
    if (timed && this.query && this.queryResult && this.queryRead) {
      encoder.resolveQuerySet(this.query, 0, 2, this.queryResult, 0); encoder.copyBufferToBuffer(this.queryResult, 0, this.queryRead, 0, 16)
      this.timerPending = true
    }
    this.render(encoder)
    this.device.queue.submit([encoder.finish()]); this.metrics.submissions++; this.metrics.solverSteps++
    this.tickPending = true
    void this.device.queue.onSubmittedWorkDone().then(() => { this.tickPending = false }).catch(() => { this.tickPending = false })
    this.metrics.cpuSubmitMs += performance.now() - start
    if (timed && this.queryRead) {
      const read = this.queryRead
      void read.mapAsync(GPUMapMode.READ).then(() => {
        const values = new BigUint64Array(read.getMappedRange()); this.metrics.gpuMs = Number(values[1] - values[0]) / 1e6
        this.gpuSamples.push(this.metrics.gpuMs); if (this.gpuSamples.length > 500) this.gpuSamples.shift()
        read.unmap(); this.timerPending = false
      }).catch(() => { this.timerPending = false })
    }
  }
  private render(encoder: GPUCommandEncoder) {
    const bind = this.device.createBindGroup({ layout: this.display.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.cells[this.index] } }, { binding: 1, resource: { buffer: this.paper } }, { binding: 2, resource: { buffer: this.view } },
    ] })
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 1, g: 1, b: 1, a: 1 } }] })
    pass.setPipeline(this.display); pass.setBindGroup(0, bind); pass.draw(3); pass.end()
  }
  draw() { if (this.dead) return; const encoder = this.device.createCommandEncoder(); this.render(encoder); this.device.queue.submit([encoder.finish()]) }
  clear() { const encoder = this.device.createCommandEncoder(); for (const b of this.cells) encoder.clearBuffer(b); this.device.queue.submit([encoder.finish()]); this.index = 0; this.solverTick = 0; this.draw() }
  async checkCanonicalBrush() { return checkCanonicalBrush(this.device) }
  async checkOracle() {
    const savedTick = this.solverTick
    const saved = await this.readState(), fixture = oracleFixture(GPU_GRID.width, GPU_GRID.height)
    try {
      const grid = makeWetGrid(GPU_GRID.width, GPU_GRID.height)
      grid.paperHeight.set(makePocPaper(GPU_GRID.width, GPU_GRID.height))
      const fields = Array.from({ length: 4 }, () => new Float64Array(GPU_GRID.width * GPU_GRID.height))
      for (let i = 0; i < grid.water.length; i++) { grid.water[i] = fixture[i * 16 + 8]; for (let c = 0; c < 4; c++) fields[c][i] = fixture[i * 16 + c] }
      const expected = wetDiffuseStepMany(grid, fields, 0.09, 0.03, 1, false, { pressure: grid.water, pressureRate: 0.015 })
      this.writeState(fixture, 0); this.step(0, false, { radius: -1, knight: false })
      const actual = await this.readState()
      let maxError = 0, negative = 0; const before = [0, 0, 0, 0], after = [0, 0, 0, 0]
      for (let i = 0; i < grid.water.length; i++) for (let c = 0; c < 4; c++) {
        const v = actual[i * 16 + c]
        maxError = Math.max(maxError, Math.abs(v - expected[c][i])); before[c] += fields[c][i]; after[c] += v
        if (v < -1e-6) negative++
      }
      const relativeMassDrift = Math.max(...before.map((v, c) => Math.abs(after[c] - v) / Math.max(v, 1e-8)))
      return { pass: maxError < 2e-6 && relativeMassDrift < 1e-6 && negative === 0, maxError, relativeMassDrift, negative, fixtureCells: 256, reference: 'Legacy nearest-8 kernel only: wetDiffuseStepMany, D=.09 B=.03 pressure=.015. Does not validate multiscale wet-path dynamics.' }
    } finally { this.writeState(saved, savedTick) }
  }
  async readPixels() {
    const width = this.context.canvas.width, height = this.context.canvas.height
    const bytesPerRow = Math.ceil(width * 4 / 256) * 256
    const read = this.device.createBuffer({ size: bytesPerRow * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
    try {
      const encoder = this.device.createCommandEncoder(); this.render(encoder)
      encoder.copyTextureToBuffer({ texture: this.context.getCurrentTexture() }, { buffer: read, bytesPerRow }, { width, height })
      this.device.queue.submit([encoder.finish()]); await read.mapAsync(GPUMapMode.READ)
      const source = new Uint8Array(read.getMappedRange()), rgba = new Uint8Array(width * height * 4)
      for (let y = 0; y < height; y++) rgba.set(source.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4)
      if (this.format.startsWith('bgra')) for (let k = 0; k < rgba.length; k += 4) { const r = rgba[k]; rgba[k] = rgba[k + 2]; rgba[k + 2] = r }
      read.unmap(); return { width, height, rgba }
    } finally { read.destroy() }
  }
  writeState(data: Float32Array, tick = this.solverTick) {
    if (data.byteLength !== this.cells[0].size) throw new Error('State size mismatch')
    this.solverTick = tick
    this.device.queue.writeBuffer(this.cells[this.index], 0, data); this.draw()
  }
  async readState() {
    const size = this.cells[0].size
    const read = this.device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
    try {
      const encoder = this.device.createCommandEncoder(); encoder.copyBufferToBuffer(this.cells[this.index], 0, read, 0, size); this.device.queue.submit([encoder.finish()])
      await read.mapAsync(GPUMapMode.READ); const copy = new Float32Array(read.getMappedRange().slice(0)); read.unmap(); return copy
    } finally { read.destroy() }
  }
  destroy() { if (this.dead) return; this.dead = true; for (const b of this.resources) b.destroy(); this.query?.destroy(); this.context.unconfigure(); this.device.destroy() }
}
