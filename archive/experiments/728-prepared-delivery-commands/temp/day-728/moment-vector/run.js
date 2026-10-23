// apps/web/src/engine/src/experiments/wetBrushTransport.ts
var TRANSPORT_MAX = 65535;
function makeWetBrushState(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) throw Error("Bounded integer grid required");
  return { width, height, water: new Uint32Array(width * height), contact: new Uint32Array(width * height), mass: new Uint32Array(width * height * 2) };
}
function depositWetBrush(s, x, y, radius, water, pigment) {
  if (radius <= 0 || [water, ...pigment].some((v) => !Number.isInteger(v) || v < 0 || v > TRANSPORT_MAX)) throw Error("Bounded fixed-point dose required");
  s.contact.fill(0);
  const added = [0, 0];
  for (let j = 0; j < s.height; j++) for (let i = 0; i < s.width; i++) {
    const distance = Math.hypot(i + 0.5 - x, j + 0.5 - y), coverage = Math.max(0, Math.min(1, (radius - distance) / 1.5));
    if (!coverage) continue;
    const n = j * s.width + i;
    s.contact[n] = Math.floor(coverage * TRANSPORT_MAX);
    s.water[n] = Math.max(s.water[n], Math.floor(coverage * water));
    for (let c = 0; c < 2; c++) {
      const k = n * 2 + c, dose2 = Math.min(TRANSPORT_MAX - s.mass[k], Math.floor(coverage * pigment[c]));
      s.mass[k] += dose2;
      added[c] += dose2;
    }
  }
  return added;
}
function exchangeWetBrush(s, p) {
  if (![p.mixRate, p.advectionRate].every((v) => Number.isInteger(v) && v >= 0 && v <= 256) || !Number.isInteger(p.direction) || Math.abs(p.direction) > 256) throw Error("Bounded rates/direction required");
  const out = s.mass.slice(), w = s.width, h = s.height;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const coordinate = p.axis === 0 ? x : y;
    if (coordinate % 2 !== p.parity) continue;
    const bx = x + (p.axis === 0 ? 1 : 0), by = y + (p.axis === 1 ? 1 : 0);
    if (bx >= w || by >= h) continue;
    const a = y * w + x, b = by * w + bx, wet = Math.min(s.water[a], s.water[b], s.contact[a], s.contact[b]);
    if (!wet) continue;
    for (let c = 0; c < 2; c++) {
      let va = s.mass[a * 2 + c], vb = s.mass[b * 2 + c];
      const diff = va - vb, mix = Math.floor(Math.floor(Math.abs(diff) * wet / TRANSPORT_MAX) * p.mixRate / 256);
      if (diff > 0) {
        const t2 = Math.min(mix, TRANSPORT_MAX - vb);
        va -= t2;
        vb += t2;
      } else {
        const t2 = Math.min(mix, TRANSPORT_MAX - va);
        va += t2;
        vb -= t2;
      }
      const forward = p.direction >= 0, src = forward ? va : vb, dst = forward ? vb : va;
      const t = Math.min(Math.floor(Math.floor(Math.floor(src * wet / TRANSPORT_MAX) * p.advectionRate / 256) * Math.abs(p.direction) / 256), TRANSPORT_MAX - dst);
      if (forward) {
        va -= t;
        vb += t;
      } else {
        va += t;
        vb -= t;
      }
      out[a * 2 + c] = va;
      out[b * 2 + c] = vb;
    }
  }
  s.mass = out;
}
function wetBrushMass(s) {
  const result = [0, 0];
  for (let i = 0; i < s.mass.length; i++) result[i % 2] += s.mass[i];
  return result;
}
var WET_BRUSH_TRANSPORT_WGSL = (
  /* wgsl */
  `
struct Params {w:u32,h:u32,axis:u32,parity:u32,mixRate:u32,advectionRate:u32,direction:i32,pad:u32}
@group(0) @binding(0) var<storage,read> src:array<vec2u>;
@group(0) @binding(1) var<storage,read_write> dst:array<vec2u>;
@group(0) @binding(2) var<storage,read> wetContact:array<vec2u>;
@group(0) @binding(3) var<uniform> p:Params;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){
 let a=id.x;if(a>=p.w*p.h){return;}let x=a%p.w;let y=a/p.w;let coord=select(y,x,p.axis==0u);let extent=select(p.h,p.w,p.axis==0u);
 if(coord%2u!=p.parity){if(coord==0u){dst[a]=src[a];}return;}
 if(coord+1u>=extent){dst[a]=src[a];return;}let b=a+select(p.w,1u,p.axis==0u);
 let wet=min(min(wetContact[a].x,wetContact[b].x),min(wetContact[a].y,wetContact[b].y));
 var va=src[a];var vb=src[b];for(var c=0u;c<2u;c++){
  let difference=i32(va[c])-i32(vb[c]);let mixAmount=((u32(abs(difference))*wet/65535u)*p.mixRate)/256u;
  if(difference>0){let t=min(mixAmount,65535u-vb[c]);va[c]-=t;vb[c]+=t;}else{let t=min(mixAmount,65535u-va[c]);va[c]+=t;vb[c]-=t;}
  let forward=p.direction>=0;let source=select(vb[c],va[c],forward);let target=select(va[c],vb[c],forward);
  let t=min((((source*wet/65535u)*p.advectionRate)/256u)*u32(abs(p.direction))/256u,65535u-target);
  if(forward){va[c]-=t;vb[c]+=t;}else{va[c]+=t;vb[c]-=t;}
 }dst[a]=va;dst[b]=vb;
}`
);
function wetBrushMetrics(s) {
  const sums = [0, 0], counts = [0, 0];
  let imbalance = 0, total = 0;
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
    const n = y * s.width + x, a = s.mass[n * 2], b = s.mass[n * 2 + 1];
    imbalance += Math.abs(a - b);
    total += a + b;
    if (s.water[n]) {
      const p = (x + y) % 2;
      sums[p] += a + b;
      counts[p]++;
    }
  }
  const means = sums.map((v, i) => v / Math.max(1, counts[i]));
  return { mixing: total ? 1 - imbalance / total : 0, checkerboardContrast: Math.abs(means[0] - means[1]) / Math.max(1, (means[0] + means[1]) / 2) };
}

// apps/web/src/engine/src/experiments/wetBrushMomentVector.ts
function validate(v) {
  if (v.length !== 5 || v.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) throw Error("Five Q8 canonical moments required");
}
function exchangeMomentVector(a, b, flow) {
  validate(a);
  validate(b);
  if (![flow.wet, flow.mixRate, flow.advectionRate, flow.direction].every(Number.isInteger) || [flow.wet, flow.mixRate, flow.advectionRate].some((x) => x < 0 || x > 255) || Math.abs(flow.direction) > 256) throw Error("Bounded integer vector flow required");
  const mixFraction = Math.floor(flow.wet * flow.mixRate / 255);
  const aa = a.map((v, i) => Math.floor(((255 - mixFraction) * v + mixFraction * b[i]) / 255)), bb = b.map((v, i) => a[i] + v - aa[i]);
  const forward = flow.direction >= 0, source = forward ? aa : bb, target = forward ? bb : aa;
  let advFraction = Math.floor(Math.floor(flow.wet * flow.advectionRate / 255) * Math.abs(flow.direction) / 256);
  for (let j = 0; j < 5; j++) if (source[j] > 0) {
    advFraction = Math.min(advFraction, Math.floor((255 * (256 - target[j]) - 1) / source[j]));
  }
  for (let j = 0; j < 5; j++) {
    const moved = Math.floor(source[j] * advFraction / 255);
    source[j] -= moved;
    target[j] += moved;
  }
  return { a: aa, b: bb, mixFraction, advFraction };
}

// apps/web/src/engine/src/experiments/wetBrushMomentVectorGpu.ts
var MOMENT_VECTOR_GPU_WGSL = `
struct Params { width:u32,height:u32,axis:u32,parity:u32,mixRate:u32,advRate:u32,direction:i32,pad:u32 };
@group(0) @binding(0)var<storage,read> src:array<u32>;
@group(0) @binding(1)var<storage,read_write> dst:array<u32>;
@group(0) @binding(2)var<uniform> u:Params;
@group(0) @binding(3)var<storage,read_write> invalid:atomic<u32>;
fn component(j:u32)->u32 {if(j==0u){return 2u;}return j+3u;}
@compute @workgroup_size(64)fn main(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=u.width*u.height){return;}let x=i%u.width;let y=i/u.width;
 let v=select(y,x,u.axis==0u);let limit=select(u.height,u.width,u.axis==0u);
 if(v%2u!=u.parity){if(v>0u){return;}}
 let matched=v%2u==u.parity&&v+1u<limit;let a=i*10u;var b=a;if(matched){b=(i+select(u.width,1u,u.axis==0u))*10u;}
 for(var k=0u;k<10u;k++){dst[a+k]=src[a+k];if(matched){dst[b+k]=src[b+k];}}
 if(!matched||atomicLoad(&invalid)>0u){return;}
 var aa:array<u32,5>;var bb:array<u32,5>;var bad=false;
 for(var j=0u;j<5u;j++){let k=component(j);aa[j]=src[a+k];bb[j]=src[b+k];bad=bad||aa[j]>255u||bb[j]>255u;}
 if(bad){atomicAdd(&invalid,1u);return;}
 let wet=min(min(src[a+8u],src[b+8u]),min(src[a+9u],src[b+9u]));let mix=wet*u.mixRate/255u;
 for(var j=0u;j<5u;j++){let sum=aa[j]+bb[j];aa[j]=((255u-mix)*aa[j]+mix*bb[j])/255u;bb[j]=sum-aa[j];}
 let forward=u.direction>=0;var fraction=((wet*u.advRate/255u)*u32(abs(u.direction)))/256u;
 for(var j=0u;j<5u;j++){let s=select(bb[j],aa[j],forward);let t=select(aa[j],bb[j],forward);if(s>0u){fraction=min(fraction,(255u*(256u-t)-1u)/s);}}
 for(var j=0u;j<5u;j++){let s=select(bb[j],aa[j],forward);let moved=s*fraction/255u;if(forward){aa[j]-=moved;bb[j]+=moved;}else{bb[j]-=moved;aa[j]+=moved;}let k=component(j);dst[a+k]=aa[j];dst[b+k]=bb[j];}
}`;
function momentVectorGpuOracle(source, p) {
  if (source.length !== p.width * p.height * 10) throw Error("Matching vector record dimensions required");
  const out = source.slice(), limit = p.axis === 0 ? p.width : p.height, indices = [2, 4, 5, 6, 7];
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    const v = p.axis === 0 ? x : y;
    if (v % 2 !== p.parity || v + 1 >= limit) continue;
    const a = (y * p.width + x) * 10, b = a + (p.axis === 0 ? 10 : p.width * 10);
    const flow = { wet: Math.min(source[a + 8], source[b + 8], source[a + 9], source[b + 9]), mixRate: p.mixRate, advectionRate: p.advectionRate, direction: p.direction };
    const pair = exchangeMomentVector(indices.map((k) => source[a + k]), indices.map((k) => source[b + k]), flow);
    indices.forEach((k, j) => {
      out[a + k] = pair.a[j];
      out[b + k] = pair.b[j];
    });
  }
  return out;
}

// apps/web/src/engine/src/experiments/wetBrushMomentRecipe.ts
function assertMomentCarrier(p) {
  if (!Number.isInteger(p.mass) || p.mass < 0 || p.mass > 255 || p.moments.some((v) => !Number.isInteger(v) || v < 0 || v > p.mass)) throw Error("Experimental moment carrier requires Q8 mass and C<=P.B; unsupported actual record");
}
function portion(source, mass) {
  return source.moments.map((v) => source.mass ? Math.floor(v * mass / source.mass) : 0);
}
function exchangeMomentPair(a, b, wet255, mixRate, advectionRate, direction) {
  assertMomentCarrier(a);
  assertMomentCarrier(b);
  if (![wet255, mixRate, advectionRate].every((v) => Number.isInteger(v) && v >= 0 && v <= 255) || !Number.isInteger(direction) || Math.abs(direction) > 256) throw Error("Bounded integer moment budget required");
  const q = Math.floor(Math.floor(Math.min(a.mass, b.mass) * wet255 / 255) * mixRate / 255), outA = portion(a, q), outB = portion(b, q);
  const aa = { mass: a.mass, moments: a.moments.map((v, i) => v - outA[i] + outB[i]) }, bb = { mass: b.mass, moments: b.moments.map((v, i) => v - outB[i] + outA[i]) };
  const forward = direction >= 0, source = forward ? aa : bb, target = forward ? bb : aa;
  const moved = Math.min(Math.floor(Math.floor(Math.floor(source.mass * wet255 / 255) * advectionRate / 255) * Math.abs(direction) / 256), 255 - target.mass), moments = portion(source, moved);
  source.mass -= moved;
  target.mass += moved;
  for (let c = 0; c < 4; c++) {
    source.moments[c] -= moments[c];
    target.moments[c] += moments[c];
  }
  assertMomentCarrier(aa);
  assertMomentCarrier(bb);
  return { a: aa, b: bb, exchanged: q, advected: moved };
}

// apps/web/src/engine/src/experiments/wetBrushMomentGpu.ts
var MOMENT_GPU_WGSL = `
struct Params { width:u32,height:u32,axis:u32,parity:u32,mixRate:u32,advRate:u32,direction:i32,pad:u32 };
@group(0) @binding(0) var<storage,read> src:array<u32>;
@group(0) @binding(1) var<storage,read_write> dst:array<u32>;
@group(0) @binding(2) var<uniform> u:Params;
@group(0) @binding(3) var<storage,read_write> invalid:atomic<u32>;
fn portion(c:u32,q:u32,m:u32)->u32 { if(m==0u){return 0u;}return c*q/m; }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=u.width*u.height){return;}
 let x=i%u.width;let y=i/u.width;let v=select(y,x,u.axis==0u);let limit=select(u.height,u.width,u.axis==0u);
 // Every output pixel has exactly one writer: matched pairs or unmatched edge.
 if(v%2u!=u.parity){if(v>0u){return;}}
 let matched=v%2u==u.parity && v+1u<limit;
 let a=i*10u;var b=a;if(matched){b=(i+select(u.width,1u,u.axis==0u))*10u;}
 for(var k=0u;k<10u;k++){dst[a+k]=src[a+k];if(matched){dst[b+k]=src[b+k];}}
 if(!matched||atomicLoad(&invalid)>0u){return;}
 var ma=src[a+2u];var mb=src[b+2u];var ca:array<u32,4>;var cb:array<u32,4>;
 var bad=ma>255u||mb>255u;
 for(var c=0u;c<4u;c++){ca[c]=src[a+4u+c];cb[c]=src[b+4u+c];bad=bad||ca[c]>ma||cb[c]>mb;}
 if(bad){atomicAdd(&invalid,1u);return;}
 let wet=min(min(src[a+8u],src[b+8u]),min(src[a+9u],src[b+9u]));
 let q=(min(ma,mb)*wet/255u)*u.mixRate/255u;
 for(var c=0u;c<4u;c++){let pa=portion(ca[c],q,ma);let pb=portion(cb[c],q,mb);ca[c]=ca[c]-pa+pb;cb[c]=cb[c]-pb+pa;}
 let forward=u.direction>=0;let sm=select(mb,ma,forward);let tm=select(ma,mb,forward);
 let t=min(((sm*wet/255u)*u.advRate/255u)*u32(abs(u.direction))/256u,255u-tm);
 for(var c=0u;c<4u;c++){let moved=portion(select(cb[c],ca[c],forward),t,sm);if(forward){ca[c]-=moved;cb[c]+=moved;}else{cb[c]-=moved;ca[c]+=moved;}}
 if(forward){ma-=t;mb+=t;}else{mb-=t;ma+=t;}
 dst[a+2u]=ma;dst[b+2u]=mb;for(var c=0u;c<4u;c++){dst[a+4u+c]=ca[c];dst[b+4u+c]=cb[c];}
}`;
function auditMomentRecords(p, c) {
  if (p.length !== c.length || p.length % 4) throw Error("Matching RGBA records required");
  let violations = 0, maxExcess = 0;
  const examples = [];
  for (let i = 0; i < p.length; i += 4) for (let k = 0; k < 4; k++) {
    const excess = c[i + k] - p[i + 2];
    if (excess > 0) {
      violations++;
      maxExcess = Math.max(maxExcess, excess);
      if (examples.length < 8) examples.push({ pixel: i / 4, channel: k, mass: p[i + 2], moment: c[i + k] });
    }
  }
  return { supported: violations === 0, violations, maxExcess, examples, pixels: p.length / 4 };
}
function packMomentRecords(p, c, wet, contact) {
  const audit = auditMomentRecords(p, c);
  if (!audit.supported) throw Error(`Unsupported actual moment carrier: ${audit.violations} channels`);
  if (wet.length !== p.length / 4 || contact.length !== wet.length) throw Error("Per-pixel physical wet/contact maps required");
  const out = new Uint32Array(wet.length * 10);
  for (let i = 0; i < wet.length; i++) {
    out.set(p.subarray(i * 4, i * 4 + 4), i * 10);
    out.set(c.subarray(i * 4, i * 4 + 4), i * 10 + 4);
    out[i * 10 + 8] = wet[i];
    out[i * 10 + 9] = contact[i];
  }
  return out;
}
var WetBrushMomentGpu = class {
  pipeline = null;
  constructor(privateDevice, diagnosticVector = false) {
    this.device = privateDevice;
    this.diagnosticVector = diagnosticVector;
  }
  diagnosticVector;
  device;
  encode(encoder, source, target, invalid, pass, enabled = false) {
    if (!enabled) return [];
    if (source === target) throw Error("Moment pair requires ping-pong buffers");
    const { width, height, axis, parity, mixRate, advectionRate, direction } = pass;
    if (![width, height, mixRate, advectionRate, direction].every(Number.isInteger) || width < 1 || height < 1 || width * height > 1024 * 1024 || mixRate < 0 || mixRate > 255 || advectionRate < 0 || advectionRate > 255 || Math.abs(direction) > 256) throw Error("Bounded moment dispatch required");
    this.pipeline ??= this.device.createComputePipeline({ layout: "auto", compute: { module: this.device.createShaderModule({ code: this.diagnosticVector ? MOMENT_VECTOR_GPU_WGSL : MOMENT_GPU_WGSL }), entryPoint: "main" } });
    const uniform = this.device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const values = new Uint32Array([width, height, axis, parity, mixRate, advectionRate, 0, 0]);
    new Int32Array(values.buffer)[6] = direction;
    this.device.queue.writeBuffer(uniform, 0, values);
    const bind = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: source } }, { binding: 1, resource: { buffer: target } }, { binding: 2, resource: { buffer: uniform } }, { binding: 3, resource: { buffer: invalid } }] });
    const cp = encoder.beginComputePass();
    cp.setPipeline(this.pipeline);
    cp.setBindGroup(0, bind);
    cp.dispatchWorkgroups(Math.ceil(width * height / 64));
    cp.end();
    return [uniform];
  }
};
function momentGpuOracle(source, pass) {
  const { width, height, axis, parity, mixRate, advectionRate, direction } = pass;
  if (source.length !== width * height * 10) throw Error("Exact packed moment dimensions required");
  const out = source.slice();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = axis === 0 ? x : y, limit = axis === 0 ? width : height;
    if (v % 2 !== parity || v + 1 >= limit) continue;
    const a = (y * width + x) * 10, b = a + (axis === 0 ? 1 : width) * 10;
    const carrier = (i) => ({ mass: source[i + 2], moments: [source[i + 4], source[i + 5], source[i + 6], source[i + 7]] });
    const wet = Math.min(source[a + 8], source[b + 8], source[a + 9], source[b + 9]);
    const result = exchangeMomentPair(carrier(a), carrier(b), wet, mixRate, advectionRate, direction);
    for (const [i, c] of [[a, result.a], [b, result.b]]) {
      out[i + 2] = c.mass;
      out.set(c.moments, i + 4);
    }
  }
  return out;
}

// docs/qa/harness/728-wet-brush-transport/moment-gate.ts
async function runMomentGate(fixture) {
  const width = fixture?.width ?? 17, height = fixture?.height ?? 13, n = width * height;
  const p = fixture?.p ?? new Uint8Array(n * 4), c = fixture?.c ?? new Uint8Array(n * 4), wet = fixture?.wet ?? new Uint8Array(n).fill(255), contact = fixture?.contact ?? wet;
  if (!fixture) for (let i = 0; i < n; i++) {
    p.set([i % 256, 200, 100, 220], i * 4);
    c.set([i % 2 ? 90 : 10, 30, 20, 100], i * 4);
  }
  const audit = auditMomentRecords(p, c);
  if (!audit.supported) return { valid: false, audit, reason: "Unsupported actual carrier; no GPU work performed" };
  let oracle = packMomentRecords(p, c, wet, contact);
  if (!navigator.gpu) throw Error("Actual WebGPU required");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw Error("No adapter");
  const device = await adapter.requestDevice(), errors = [], owned = [];
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  const allocate = (size, usage) => {
    const b = device.createBuffer({ size, usage });
    owned.push(b);
    return b;
  };
  try {
    const size = oracle.byteLength, buffers = [allocate(size, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC), allocate(size, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC)], invalid = allocate(4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST), read = allocate(size + 4, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ), operator = new WetBrushMomentGpu(device);
    device.queue.writeBuffer(buffers[0], 0, oracle);
    let index = 0;
    const start = performance.now(), encoder = device.createCommandEncoder();
    for (let iteration = 0; iteration < 8; iteration++) for (const axis of [0, 1]) for (const parity of [0, 1]) {
      const pass = { width, height, axis, parity, mixRate: 48, advectionRate: 80, direction: iteration % 2 ? -256 : 256 };
      oracle = momentGpuOracle(oracle, pass);
      owned.push(...operator.encode(encoder, buffers[index], buffers[1 - index], invalid, pass, true));
      index = 1 - index;
    }
    encoder.copyBufferToBuffer(buffers[index], 0, read, 0, size);
    encoder.copyBufferToBuffer(invalid, 0, read, size, 4);
    device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const snapshot = read.getMappedRange().slice(0), actual = new Uint32Array(snapshot, 0, size / 4), bad = new Uint32Array(snapshot, size, 1)[0];
    read.unmap();
    let differences = 0, maxDifference = 0;
    for (let i = 0; i < actual.length; i++) {
      const d = Math.abs(actual[i] - oracle[i]);
      if (d) {
        differences++;
        maxDifference = Math.max(d, maxDifference);
      }
    }
    return { valid: differences === 0 && bad === 0 && errors.length === 0, width, height, passes: 32, audit, invalidPairs: bad, differences, maxDifference, errors, submitAndReadbackMs: performance.now() - start, limitations: ["Synthetic Q8 fixture unless actual records supplied", "Integer storage gate does not prove texture pack/unpack fidelity", "No Room integration or artwork quality claim"] };
  } finally {
    for (const b of owned) b.destroy();
    device.destroy();
  }
}

// apps/web/src/engine/src/experiments/wetBrushMomentTextureOwner.ts
var PACK = `struct U{x:u32,y:u32,w:u32,h:u32};
@group(0) @binding(0)var p:texture_2d<f32>;
@group(0) @binding(1)var c:texture_2d<f32>;
@group(0) @binding(2)var wet:texture_2d<f32>;
@group(0) @binding(3)var contact:texture_2d<f32>;
@group(0) @binding(4)var<storage,read_write> records:array<u32>;
@group(0) @binding(5)var<storage,read_write> invalid:atomic<u32>;
@group(0) @binding(6)var<uniform> u:U;
@compute @workgroup_size(64)fn main(@builtin(global_invocation_id) g:vec3u){let i=g.x;if(i>=u.w*u.h){return;}let xy=vec2i(i32(u.x+i%u.w),i32(u.y+i/u.w));let pp=vec4u(round(textureLoad(p,xy,0)*255.0));let cc=vec4u(round(textureLoad(c,xy,0)*255.0));let vv=textureLoad(wet,xy,0);let w=u32(round(clamp(vv.b/max(vv.a,0.002),0.0,1.0)*255.0));let touch=u32(round(clamp(textureLoad(contact,xy,0).a,0.0,1.0)*255.0));let j=i*10u;for(var k=0u;k<4u;k++){records[j+k]=pp[k];records[j+4u+k]=cc[k];if(cc[k]>pp.b){atomicAdd(&invalid,1u);}}records[j+8u]=w;records[j+9u]=touch;}`;
var UNPACK = `struct U{x:u32,y:u32,w:u32,h:u32};
@group(0) @binding(0)var<storage,read> records:array<u32>;
@group(0) @binding(1)var p:texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(2)var c:texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(3)var<uniform> u:U;
@compute @workgroup_size(64)fn main(@builtin(global_invocation_id) g:vec3u){let i=g.x;if(i>=u.w*u.h){return;}let j=i*10u;let xy=vec2i(i32(u.x+i%u.w),i32(u.y+i/u.w));textureStore(p,xy,vec4f(f32(records[j]),f32(records[j+1u]),f32(records[j+2u]),f32(records[j+3u]))/255.0);textureStore(c,xy,vec4f(f32(records[j+4u]),f32(records[j+5u]),f32(records[j+6u]),f32(records[j+7u]))/255.0);}`;
var WetBrushMomentTextureOwner = class {
  device;
  operator;
  pack = null;
  unpack = null;
  diagnosticVector;
  constructor(device, diagnosticVector = false) {
    this.device = device;
    this.diagnosticVector = diagnosticVector;
    this.operator = new WetBrushMomentGpu(device, diagnosticVector);
  }
  encode(encoder, input, enabled = false) {
    if (!enabled) return { buffers: [], invalid: null, pairPasses: 0 };
    const { pigment, color, availableWater, contact, outputPigment, outputColor, rect, recipe } = input;
    const textures = [pigment, color, availableWater, contact, outputPigment, outputColor];
    const inPlace = input.diagnosticInPlace === true;
    const aliasValid = inPlace ? outputPigment === pigment && outputColor === color : !textures.slice(0, 4).includes(outputPigment) && !textures.slice(0, 4).includes(outputColor);
    if (textures.some((t) => t.format !== "rgba8unorm" || t.width !== pigment.width || t.height !== pigment.height) || pigment === color || !aliasValid || outputPigment === outputColor) throw Error("Distinct matched canonical RGBA8 inputs/outputs required");
    if (inPlace && (availableWater === pigment || availableWater === color || contact === pigment || contact === color || [pigment, color].some((t) => (t.usage & (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING)) !== (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING)))) throw Error("In-place moment requires separate water/contact and sampled/storage material usage");
    const { x, y, width, height } = rect;
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width < 1 || height < 1 || x + width > pigment.width || y + height > pigment.height || width * height > 512 * 512) throw Error("Bounded <=512-square moment ROI required");
    if (![recipe.mixRate, recipe.advectionRate, recipe.directionX, recipe.directionY].every(Number.isInteger) || recipe.mixRate < 0 || recipe.mixRate > 255 || recipe.advectionRate < 0 || recipe.advectionRate > 255 || Math.abs(recipe.directionX) > 256 || Math.abs(recipe.directionY) > 256) throw Error("Prepared bounded contact recipe required");
    const d = this.device, buffers = [], make = (size, usage) => {
      const b2 = d.createBuffer({ size, usage });
      buffers.push(b2);
      return b2;
    };
    const a = make(width * height * 40, GPUBufferUsage.STORAGE), b = make(width * height * 40, GPUBufferUsage.STORAGE), invalid = make(4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST), u = make(16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    d.queue.writeBuffer(u, 0, new Uint32Array([x, y, width, height]));
    encoder.clearBuffer(invalid);
    this.pack ??= d.createComputePipeline({ layout: "auto", compute: { module: d.createShaderModule({ code: this.diagnosticVector ? PACK.replace("if(cc[k]>pp.b){atomicAdd(&invalid,1u);}", "") : PACK }), entryPoint: "main" } });
    this.unpack ??= d.createComputePipeline({ layout: "auto", compute: { module: d.createShaderModule({ code: UNPACK }), entryPoint: "main" } });
    const execute = (pipeline, entries) => {
      const cp = encoder.beginComputePass();
      cp.setPipeline(pipeline);
      cp.setBindGroup(0, d.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries }));
      cp.dispatchWorkgroups(Math.ceil(width * height / 64));
      cp.end();
    };
    execute(this.pack, [...textures.slice(0, 4).map((t, binding) => ({ binding, resource: t.createView() })), { binding: 4, resource: { buffer: a } }, { binding: 5, resource: { buffer: invalid } }, { binding: 6, resource: { buffer: u } }]);
    let source = a, target = b;
    for (const axis of [0, 1]) for (const parity of [0, 1]) {
      buffers.push(...this.operator.encode(encoder, source, target, invalid, { width, height, axis, parity, mixRate: recipe.mixRate, advectionRate: recipe.advectionRate, direction: axis === 0 ? recipe.directionX : recipe.directionY }, true));
      [source, target] = [target, source];
    }
    if (!inPlace) {
      encoder.copyTextureToTexture({ texture: pigment }, { texture: outputPigment }, [pigment.width, pigment.height]);
      encoder.copyTextureToTexture({ texture: color }, { texture: outputColor }, [color.width, color.height]);
    }
    execute(this.unpack, [{ binding: 0, resource: { buffer: source } }, { binding: 1, resource: outputPigment.createView() }, { binding: 2, resource: outputColor.createView() }, { binding: 3, resource: { buffer: u } }]);
    return { buffers, invalid, pairPasses: 4 };
  }
};

// docs/qa/harness/728-wet-brush-transport/moment-texture-oracle.ts
function expectedMomentTexture(p, c, width, rect, recipe, invalidFixture = false, diagnosticVector = false) {
  let expectedP = p, expectedC = c;
  if (!invalidFixture || diagnosticVector) {
    const crop = (bytes) => {
      const out = new Uint8Array(rect.width * rect.height * 4);
      for (let row = 0; row < rect.height; row++) out.set(bytes.subarray(((rect.y + row) * width + rect.x) * 4, ((rect.y + row) * width + rect.x + rect.width) * 4), row * rect.width * 4);
      return out;
    };
    let oracle;
    if (diagnosticVector) {
      const pp = crop(p), cc = crop(c);
      oracle = new Uint32Array(rect.width * rect.height * 10);
      for (let i = 0; i < pp.length / 4; i++) {
        oracle.set(pp.subarray(i * 4, i * 4 + 4), i * 10);
        oracle.set(cc.subarray(i * 4, i * 4 + 4), i * 10 + 4);
        oracle[i * 10 + 8] = 255;
        oracle[i * 10 + 9] = 255;
      }
    } else oracle = packMomentRecords(crop(p), crop(c), new Uint8Array(rect.width * rect.height).fill(255), new Uint8Array(rect.width * rect.height).fill(255));
    for (const axis of [0, 1]) for (const parity of [0, 1]) oracle = (diagnosticVector ? momentVectorGpuOracle : momentGpuOracle)(oracle, { width: rect.width, height: rect.height, axis, parity, mixRate: recipe.mixRate, advectionRate: recipe.advectionRate, direction: axis === 0 ? recipe.directionX : recipe.directionY });
    expectedP = p.slice();
    expectedC = c.slice();
    for (let i = 0; i < rect.width * rect.height; i++) {
      const offset = ((rect.y + Math.floor(i / rect.width)) * width + rect.x + i % rect.width) * 4;
      expectedP.set(oracle.subarray(i * 10, i * 10 + 4), offset);
      expectedC.set(oracle.subarray(i * 10 + 4, i * 10 + 8), offset);
    }
  }
  return { expectedP, expectedC };
}

// docs/qa/harness/728-wet-brush-transport/moment-texture-gate.ts
async function runMomentTextureGate(transport = false, invalidFixture = false, diagnosticInPlace = false, partialRoi = false, diagnosticVector = false, zeroCarrierFixture = false) {
  if (!navigator.gpu) throw Error("WebGPU required");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw Error("Adapter unavailable");
  const device = await adapter.requestDevice(), owned = [], errors = [];
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  const width = 17, height = 13, n = width * height, p = new Uint8Array(n * 4), c = p.slice(), wet = p.slice(), contact = p.slice();
  for (let i = 0; i < n; i++) {
    p.set([i % 256, 200, 100, 220], i * 4);
    c.set([i % 2 ? 90 : 10, 30, 20, 100], i * 4);
    wet.set([0, 0, 255, 255], i * 4);
    contact.set([0, 0, 0, 255], i * 4);
  }
  if (zeroCarrierFixture) {
    if (!diagnosticVector) throw Error("Zero independent carriers require vector contract");
    for (let i = 0; i < n; i++) {
      p[i * 4 + 2] = 0;
      c[i * 4 + 3] = 0;
    }
  }
  const rect = partialRoi ? { x: 2, y: 2, width: 11, height: 7 } : { x: 0, y: 0, width, height };
  if (invalidFixture) {
    const offset = (rect.y * width + rect.x) * 4;
    if (diagnosticVector) {
      p.set([255, 255, 170, 255], offset);
      c.set([80, 180, 60, 200], offset);
    } else c[offset] = 101;
  }
  try {
    const texture = (bytes2) => {
      const t = device.createTexture({ size: [width, height], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST });
      owned.push(t);
      if (bytes2) device.queue.writeTexture({ texture: t }, bytes2, { bytesPerRow: width * 4 }, [width, height]);
      return t;
    }, pt = texture(p), ct = texture(c), wt = texture(wet), touch = texture(contact), po = diagnosticInPlace ? pt : texture(), co = diagnosticInPlace ? ct : texture(), owner = new WetBrushMomentTextureOwner(device, diagnosticVector), encoder = device.createCommandEncoder();
    const recipe = { ordinal: 0, x256: 0, y256: 0, radius256: 256, pressure256: 256, directionX: 256, directionY: -256, mixRate: transport ? 48 : 0, advectionRate: transport ? 80 : 0 };
    const result = owner.encode(encoder, { pigment: pt, color: ct, availableWater: wt, contact: touch, outputPigment: po, outputColor: co, rect, recipe, diagnosticInPlace }, true);
    owned.push(...result.buffers);
    const read = device.createBuffer({ size: 256 * height * 2 + 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    owned.push(read);
    encoder.copyTextureToBuffer({ texture: po }, { buffer: read, bytesPerRow: 256 }, [width, height]);
    encoder.copyTextureToBuffer({ texture: co }, { buffer: read, offset: 256 * height, bytesPerRow: 256 }, [width, height]);
    encoder.copyBufferToBuffer(result.invalid, 0, read, 256 * height * 2, 4);
    device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(read.getMappedRange().slice(0)), actualP = p.slice(), actualC = c.slice();
    for (let y = 0; y < height; y++) {
      actualP.set(bytes.subarray(y * 256, y * 256 + width * 4), y * width * 4);
      actualC.set(bytes.subarray(256 * height + y * 256, 256 * height + y * 256 + width * 4), y * width * 4);
    }
    const invalid = new Uint32Array(bytes.buffer, 256 * height * 2, 1)[0];
    read.unmap();
    const { expectedP, expectedC } = expectedMomentTexture(p, c, width, rect, recipe, invalidFixture, diagnosticVector);
    let differences = 0, maxDifference = 0;
    for (const [actual, expected] of [[actualP, expectedP], [actualC, expectedC]]) for (let i = 0; i < actual.length; i++) {
      const delta = Math.abs(actual[i] - expected[i]);
      if (delta) {
        differences++;
        maxDifference = Math.max(maxDifference, delta);
      }
    }
    const sums = (bytes2) => [0, 1, 2, 3].map((k) => bytes2.reduce((sum, v, i) => sum + (i % 4 === k ? v : 0), 0));
    const channels = { beforeP: sums(p), beforeC: sums(c), afterP: sums(actualP), afterC: sums(actualC) };
    let outsideDifferences = 0;
    for (let i = 0; i < n; i++) {
      const x = i % width, y = Math.floor(i / width);
      if (x < rect.x || x >= rect.x + rect.width || y < rect.y || y >= rect.y + rect.height) for (let k = 0; k < 4; k++) outsideDifferences += Number(actualP[i * 4 + k] !== p[i * 4 + k]) + Number(actualC[i * 4 + k] !== c[i * 4 + k]);
    }
    return { channels, outsideDifferences, valid: differences === 0 && errors.length === 0 && (invalidFixture && !diagnosticVector ? invalid === 1 : invalid === 0), transport, invalidFixture, diagnosticInPlace, partialRoi, diagnosticVector, zeroCarrierFixture, fixtureMeaning: diagnosticVector && invalidFixture ? "Supported source-fit PB170/CG180/CA200, not invalid carrier" : invalidFixture ? "Legacy C<=PB violation" : zeroCarrierFixture ? "Supported zero-PB/zero-CA positive optical RGB" : "Normal", invalidChannels: invalid, differences, maxDifference, errors, limitations: ["Synthetic actual RGBA8 format gate", "Not an actual Room scene or naturalness judgment", "No hardware performance claim"] };
  } finally {
    for (const r of owned) r.destroy();
    device.destroy();
  }
}

// docs/qa/harness/728-wet-brush-transport/run.ts
var N = 128;
var R = 25;
var dose = 180;
var corners = [[300, 300], [600, 300], [600, 500], [300, 500], [300, 700], [600, 700]];
function tape() {
  const points = [corners[0]];
  for (let i = 1; i < corners.length; i++) {
    const [x, y] = corners[i - 1], [tx, ty] = corners[i], n = Math.ceil(Math.hypot(tx - x, ty - y) / 20);
    for (let j = 1; j <= n; j++) points.push([x + (tx - x) * j / n, y + (ty - y) * j / n]);
  }
  return points;
}
var depositShader = `struct Params{n:u32,pad:vec3u}
@group(0) @binding(0) var<storage,read_write> mass:array<vec2u>;@group(0) @binding(1) var<storage,read> dose:array<vec2u>;@group(0) @binding(2) var<uniform> p:Params;@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){if(id.x>=p.n){return;}mass[id.x]=min(vec2u(65535u),mass[id.x]+dose[id.x]);}`;
var GpuTransport = class {
  device;
  mass;
  wet;
  dose;
  pass;
  deposit;
  index = 0;
  constructor(device) {
    this.device = device;
    const create = (bytes, uniform = false) => device.createBuffer({ size: bytes, usage: uniform ? GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST : GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    this.mass = [create(N * N * 8), create(N * N * 8)];
    this.wet = create(N * N * 8);
    this.dose = create(N * N * 8);
    this.pass = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: WET_BRUSH_TRANSPORT_WGSL }), entryPoint: "main" } });
    this.deposit = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: depositShader }), entryPoint: "main" } });
  }
  step(contact, delta, passes) {
    const d = this.device, wet = new Uint32Array(N * N * 2);
    for (let i = 0; i < N * N; i++) {
      wet[i * 2] = contact.water[i];
      wet[i * 2 + 1] = contact.contact[i];
    }
    d.queue.writeBuffer(this.wet, 0, wet);
    d.queue.writeBuffer(this.dose, 0, delta);
    const encoder = d.createCommandEncoder(), transient = [];
    const uniform = (data) => {
      const b = d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(b, 0, data);
      transient.push(b);
      return b;
    };
    const emit = (pipeline, entries) => {
      const p = encoder.beginComputePass();
      p.setPipeline(pipeline);
      p.setBindGroup(0, d.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries }));
      p.dispatchWorkgroups(Math.ceil(N * N / 64));
      p.end();
    };
    emit(this.deposit, [{ binding: 0, resource: { buffer: this.mass[this.index] } }, { binding: 1, resource: { buffer: this.dose } }, { binding: 2, resource: { buffer: uniform(new Uint32Array([N * N, 0, 0, 0, 0, 0, 0, 0])) } }]);
    for (const p of passes) {
      const next = 1 - this.index, params = new Uint32Array([N, N, p.axis, p.parity, p.mixRate, p.advectionRate, p.direction >>> 0, 0]);
      emit(this.pass, [{ binding: 0, resource: { buffer: this.mass[this.index] } }, { binding: 1, resource: { buffer: this.mass[next] } }, { binding: 2, resource: { buffer: this.wet } }, { binding: 3, resource: { buffer: uniform(params) } }]);
      this.index = next;
    }
    d.queue.submit([encoder.finish()]);
    return d.queue.onSubmittedWorkDone().then(() => {
      for (const b of transient) b.destroy();
    });
  }
  async read() {
    const b = this.device.createBuffer({ size: N * N * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }), e = this.device.createCommandEncoder();
    e.copyBufferToBuffer(this.mass[this.index], 0, b, 0, N * N * 8);
    this.device.queue.submit([e.finish()]);
    await b.mapAsync(GPUMapMode.READ);
    const out = new Uint32Array(b.getMappedRange().slice(0));
    b.unmap();
    b.destroy();
    return out;
  }
  destroy() {
    for (const b of [...this.mass, this.wet, this.dose]) b.destroy();
    this.device.destroy();
  }
};
function draw(canvas, s) {
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext("2d"), image = ctx.createImageData(N, N);
  for (let n = 0; n < N * N; n++) {
    const a = 1 - Math.exp(-(s.mass[n * 2] + s.mass[n * 2 + 1]) / 2400), green = s.mass[n * 2 + 1] / Math.max(1, s.mass[n * 2] + s.mass[n * 2 + 1]);
    image.data.set([Math.round(250 * (1 - a) + a * (65 + green * 25)), Math.round(249 * (1 - a) + a * green * 115), Math.round(247 * (1 - a) + a * (160 - green * 120)), 255], n * 4);
  }
  ctx.putImageData(image, 0, 0);
}
async function runWetTransport(scene, transport = true) {
  if (!navigator.gpu) throw Error("WebGPU unavailable; hardware not validated");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw Error("WebGPU adapter unavailable");
  const device = await adapter.requestDevice(), gpu = new GpuTransport(device), errors = [];
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  const reference = makeWetBrushState(N, N), oracle = makeWetBrushState(N, N), points = tape(), expected = [0, 0];
  let before = points[0];
  try {
    if (scene === "unified") for (const [x, y] of points) depositWetBrush(oracle, x / 8, y / 8, R, 65535, [0, 0]);
    let step = 0;
    for (const [x, y] of points) {
      const green = step > points.length / 2, pigment = green ? [0, dose] : [dose, 0], delta = new Uint32Array(N * N * 2);
      const old = oracle.mass.slice(), added = depositWetBrush(oracle, x / 8, y / 8, R, 65535, pigment);
      for (let i = 0; i < delta.length; i++) delta[i] = oracle.mass[i] - old[i];
      expected[0] += added[0];
      expected[1] += added[1];
      depositWetBrush(reference, x / 8, y / 8, R, 65535, pigment);
      const dx = x - before[0], dy = y - before[1], length = Math.hypot(dx, dy), direction = [length ? Math.round(dx / length * 256) : 0, length ? Math.round(dy / length * 256) : 0], passes = transport ? [{ axis: 0, parity: step % 2, mixRate: 48, advectionRate: 80, direction: direction[0] }, { axis: 1, parity: step % 2, mixRate: 48, advectionRate: 80, direction: direction[1] }, { axis: 0, parity: (step + 1) % 2, mixRate: 48, advectionRate: 80, direction: direction[0] }, { axis: 1, parity: (step + 1) % 2, mixRate: 48, advectionRate: 80, direction: direction[1] }] : [];
      for (const p of passes) exchangeWetBrush(oracle, p);
      await gpu.step(oracle, delta, passes);
      before = [x, y];
      step++;
    }
    const bytes = await gpu.read(), exact = bytes.every((v, i) => v === oracle.mass[i]);
    oracle.mass = bytes;
    draw(document.querySelector("#reference"), reference);
    draw(document.querySelector("#candidate"), oracle);
    return { scene, transport, newModel: true, canonical: false, grid: N, brushWorldPx: 400, tapePoints: points.length, expectedMass: expected, actualMass: wetBrushMass(oracle), metrics: { reference: wetBrushMetrics(reference), candidate: wetBrushMetrics(oracle) }, massExact: expected.every((v, i) => v === wetBrushMass(oracle)[i]), gpuVsCpuExact: exact, errors, limitations: ["Integer new-operator prototype, NOT Grafetto watercolor integration", "Per-step queue completion ensures small fixture lifetime, NOT performance", "No baked-paper/tide/drying solver; image is simple tracer presentation", "Prior water and combined water use same deposition; differing wet timing may yield different images", "Hardware picture quality unreviewed"] };
  } finally {
    gpu.destroy();
  }
}
var button = document.querySelector("#run");
button?.addEventListener("click", async () => {
  button.disabled = true;
  try {
    document.querySelector("#status").textContent = JSON.stringify(await runWetTransport(document.querySelector("#scene").value, document.querySelector("#on").checked), null, 2);
  } catch (e) {
    document.querySelector("#status").textContent = String(e);
  } finally {
    button.disabled = false;
  }
});
export {
  runMomentGate,
  runMomentTextureGate,
  runWetTransport
};
