// apps/web/src/engine/src/webgpuCanonical/dispatchRect.ts
function canonicalDispatchRect(width, height, scissor) {
  const s = (scissor ?? [0, 0, width, height]).map(Math.fround);
  if (s.some((v) => !Number.isFinite(v))) throw new Error("Canonical dispatch scissor must be finite");
  const x1 = Math.fround(s[0] + s[2]), y1 = Math.fround(s[1] + s[3]);
  const clamp = (n, max) => Math.max(0, Math.min(max, n));
  const left = clamp(Math.ceil(s[0] - 0.5), width), right = clamp(Math.ceil(x1 - 0.5), width);
  const bottom = clamp(Math.ceil(s[1] - 0.5), height), top = clamp(Math.ceil(y1 - 0.5), height);
  return [left, height - top, Math.max(0, right - left), Math.max(0, top - bottom)];
}

// apps/web/src/engine/src/webgpuCanonical/transientBuffers.ts
function withTransientGpuBuffers(encode) {
  const allocated = /* @__PURE__ */ new Set();
  try {
    return encode((buffer) => {
      allocated.add(buffer);
      return buffer;
    });
  } catch (error) {
    for (const buffer of allocated) buffer.destroy();
    throw error;
  }
}

// apps/web/src/engine/src/webgpuCanonical/brush.ts
var CANONICAL_TEXTURE_BRUSH_WGSL = `
struct U { step:vec2f,texel:vec2f,flowRect:vec4f,control:vec4f,scissor:vec4f,dispatch:vec4u }
@group(0) @binding(0) var<uniform> u:U;
@group(0) @binding(1) var pigment:texture_2d<f32>;
@group(0) @binding(2) var color:texture_2d<f32>;
@group(0) @binding(3) var flow:texture_2d<f32>;
@group(0) @binding(4) var water:texture_2d<f32>;
@group(0) @binding(5) var linearClamp:sampler;
@group(0) @binding(6) var outPigment:texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(7) var outColor:texture_storage_2d<rgba8unorm,write>;
fn sampled(tex:texture_2d<f32>,uv:vec2f,useLinear:bool)->vec4f{
 if(useLinear){return textureSampleLevel(tex,linearClamp,vec2f(uv.x,1.0-uv.y),0);}
 let dims=textureDimensions(tex);let glCell=vec2i(floor(uv*vec2f(dims)));let cell=clamp(vec2i(glCell.x,i32(dims.y)-1-glCell.y),vec2i(0),vec2i(dims)-1);return textureLoad(tex,cell,0);
}
fn pigmentAt(uv:vec2f)->vec4f{return sampled(pigment,uv,u.control.y>.5);}
fn colorAt(uv:vec2f)->vec4f{return sampled(color,uv,u.control.z>.5);}
fn waterAt(uv:vec2f)->vec4f{return sampled(water,uv,u.control.w>.5);}
fn flowAt(uv:vec2f)->vec3f {
 let local=(uv-u.flowRect.xy)/u.flowRect.zw;
 if(min(min(local.x,local.y),min(1.0-local.x,1.0-local.y))<0.0){return vec3f(.5,.5,0);}
 return sampled(flow,local,true).rgb;
}
fn axis(k:u32)->vec2f {if(k==0u){return vec2f(1,0);}if(k==1u){return vec2f(-1,0);}if(k==2u){return vec2f(0,1);}return vec2f(0,-1);}
fn snap(uv:vec2f)->vec2f{return(floor(uv/u.texel)+.5)*u.texel;}
fn raw(startUv:vec2f,endUv:vec2f,direction:vec2f)->f32 {
 let a=snap(startUv);let b=snap(endUv);
 if(min(min(b.x,b.y),min(1.0-b.x,1.0-b.y))<0.0||min(min(a.x,a.y),min(1.0-a.x,1.0-a.y))<0.0){return 0;}
 let f=flowAt(a);let velocity=f.rg*2.0-1.0;
 var contact=smoothstep(.015,.15,min(waterAt(a).a,waterAt(b).a));
 contact*=step(.015,waterAt((a+b)*.5).a);
 let donor=pigmentAt(a).a;let neighbour=pigmentAt(b).a;
 let mixFraction=.02*max(donor-neighbour,0.0)/max(donor,5e-5);
 let dose=min(f.b,flowAt(b).b);let clock=-log(max(1.0-clamp(dose,0,1),1.0/255.0));
 return(.3535533905932738*u.control.x*abs(dot(.5*(velocity+(flowAt(b).rg*2.0-1.0)),direction))*clock+mixFraction*dose)*contact;
}
fn channelLimit(q:f32,cap:f32,amount:f32)->f32 {if(q<.5||amount<=0){return 1;}return min(1.0,cap/(q*amount));}
fn fraction(startUv:vec2f,endUv:vec2f,direction:vec2f)->f32 {
 let a=snap(startUv);let b=snap(endUv);let amount=raw(a,b,direction);if(amount<=0){return 0;}
 let P=floor(pigmentAt(a)*255.0+.5);let C=floor(colorAt(a)*255.0+.5);
 let roomP=floor((255.0-floor(pigmentAt(b)*255.0+.5))/4.0);
 let roomC=floor((255.0-floor(colorAt(b)*255.0+.5))/4.0);
 var limit=1.0;
 for(var k=0u;k<4u;k++){limit=min(limit,channelLimit(P[k],roomP[k],amount));}
 for(var k=0u;k<4u;k++){limit=min(limit,channelLimit(C[k],roomC[k],amount));}
 return amount*limit;
}
@compute @workgroup_size(8,8) fn brush(@builtin(global_invocation_id) tid:vec3u) {
 if(any(tid.xy>=u.dispatch.zw)){return;}let q=tid.xy+u.dispatch.xy;
 let dims=textureDimensions(outPigment);if(any(q>=dims)){return;}
 let glPixel=vec2f(f32(q.x)+.5,f32(dims.y)-f32(q.y)-.5);if(any(glPixel<u.scissor.xy)||any(glPixel>=u.scissor.xy+u.scissor.zw)){return;}
 let center=snap(vec2f(f32(q.x)+.5,f32(dims.y)-f32(q.y)-.5)/vec2f(dims));
 let ownP=floor(pigmentAt(center)*255.0+.5);let ownC=floor(colorAt(center)*255.0+.5);
 var P=ownP;var C=ownC;
 for(var k=0u;k<4u;k++){
  let dir=axis(k);let neighbour=snap(center+dir*u.step);let give=fraction(center,neighbour,dir);let take=fraction(neighbour,center,-dir);
  P-=floor(ownP*give);C-=floor(ownC*give);
  P+=floor(floor(pigmentAt(neighbour)*255.0+.5)*take);C+=floor(floor(colorAt(neighbour)*255.0+.5)*take);
 }
 textureStore(outPigment,vec2i(q),clamp(P/255.0,vec4f(0),vec4f(1)));
 textureStore(outColor,vec2i(q),clamp(C/255.0,vec4f(0),vec4f(1)));
}
`;
var CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL = CANONICAL_TEXTURE_BRUSH_WGSL.replace("dispatch:vec4u }", "dispatch:vec4u,output:vec4f }").replace("@group(0) @binding(7) var outColor:texture_storage_2d<rgba8unorm,write>;", "").replace(
  " textureStore(outPigment,vec2i(q),clamp(P/255.0,vec4f(0),vec4f(1)));\n textureStore(outColor,vec2i(q),clamp(C/255.0,vec4f(0),vec4f(1)));",
  " textureStore(outPigment,vec2i(q),clamp(select(P,C,u.output.x>.5)/255.0,vec4f(0),vec4f(1)));"
);
var CanonicalBrushContact = class {
  device;
  pairedPipeline = null;
  singlePipeline;
  /** Room's planner never calls encode paired: defer that unused compiler job.
   * Standalone diagnostic default keeps the previous eager paired→single order. */
  constructor(device, deferPaired = false) {
    this.device = device;
    if (!deferPaired) this.pairedPipeline = this.createPairedPipeline();
    const module = device.createShaderModule({ label: "canonical single Q8 brush contact", code: CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL });
    this.singlePipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "brush" } });
  }
  createPairedPipeline() {
    const module = this.device.createShaderModule({ label: "canonical paired Q8 brush contact", code: CANONICAL_TEXTURE_BRUSH_WGSL });
    return this.device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "brush" } });
  }
  get pipeline() {
    return this.pairedPipeline ??= this.createPairedPipeline();
  }
  encode(ctx, fields, step, gain, flowRect, scissor) {
    return withTransientGpuBuffers((retain) => {
      const f = fields;
      if ([f.pigment, f.color, f.flow, f.water].some((a) => a.texture === f.outPigment.texture || a.texture === f.outColor.texture) || f.outPigment.texture === f.outColor.texture) throw new Error("Canonical brush requires distinct read/write fields");
      const rect = canonicalDispatchRect(f.outPigment.width, f.outPigment.height, scissor);
      if (!rect[2] || !rect[3]) return [];
      const values = new Float32Array(20);
      values.set([...step, 1 / f.pigment.width, 1 / f.pigment.height, ...flowRect, gain, +(f.pigment.filter === "linear"), +(f.color.filter === "linear"), +(f.water.filter === "linear"), ...scissor ?? [0, 0, f.outPigment.width, f.outPigment.height]]);
      new Uint32Array(values.buffer).set(rect, 16);
      const u = retain(this.device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
      this.device.queue.writeBuffer(u, 0, values);
      const entries = [{ binding: 0, resource: { buffer: u } }, ...[f.pigment, f.color, f.flow, f.water].map((field, k) => ({ binding: k + 1, resource: field.view })), { binding: 5, resource: ctx.linear }, { binding: 6, resource: f.outPigment.view }, { binding: 7, resource: f.outColor.view }];
      const group = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries }), pass = ctx.encoder.beginComputePass();
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, group);
      pass.dispatchWorkgroups(Math.ceil(rect[2] / 8), Math.ceil(rect[3] / 8));
      pass.end();
      return [u];
    });
  }
  encodeSingle(ctx, fields, output, step, gain, flowRect, scissor) {
    return withTransientGpuBuffers((retain) => {
      const f = fields;
      if ([f.pigment, f.color, f.flow, f.water].some((a) => a.texture === f.out.texture)) throw new Error("Canonical single brush requires distinct read/write fields");
      if (f.out.width !== f.pigment.width || f.out.height !== f.pigment.height || f.color.width !== f.pigment.width || f.color.height !== f.pigment.height) throw new Error("Canonical single brush P/C/output dimensions mismatch");
      const rect = canonicalDispatchRect(f.out.width, f.out.height, scissor);
      if (!rect[2] || !rect[3]) return [];
      const values = new Float32Array(24);
      values.set([...step, 1 / f.pigment.width, 1 / f.pigment.height, ...flowRect, gain, +(f.pigment.filter === "linear"), +(f.color.filter === "linear"), +(f.water.filter === "linear"), ...scissor ?? [0, 0, f.out.width, f.out.height]]);
      new Uint32Array(values.buffer).set(rect, 16);
      values.set([+(output === "color"), 0, 0, 0], 20);
      const u = retain(this.device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
      this.device.queue.writeBuffer(u, 0, values);
      const entries = [{ binding: 0, resource: { buffer: u } }, ...[f.pigment, f.color, f.flow, f.water].map((field, k) => ({ binding: k + 1, resource: field.view })), { binding: 5, resource: ctx.linear }, { binding: 6, resource: f.out.view }];
      const group = this.device.createBindGroup({ layout: this.singlePipeline.getBindGroupLayout(0), entries }), pass = ctx.encoder.beginComputePass();
      pass.setPipeline(this.singlePipeline);
      pass.setBindGroup(0, group);
      pass.dispatchWorkgroups(Math.ceil(rect[2] / 8), Math.ceil(rect[3] / 8));
      pass.end();
      return [u];
    });
  }
};

// docs/qa/harness/728-native-end-to-end/brushRawFlowControl.ts
function rawFlowControlShader() {
  const old = "return sampled(flow,local,true).rgb;";
  if (CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL.split(old).length !== 2) throw Error("Exact flow-only shader seam changed");
  return CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL.replace(old, "return textureSampleLevel(flow,linearClamp,local,0).rgb;");
}
function encodeRawFlowBrush(ctx, fields, output, gain, flowRect, scissor) {
  const { device, encoder } = ctx, f = fields;
  if ([f.pigment, f.color, f.water, f.flow].some((v) => v.texture === f.out.texture) || [f.pigment, f.color, f.water, f.out].some((v) => v.width !== 1536 || v.height !== 1536 || v.filter !== "nearest")) throw Error("Exact original contact resources required");
  const module = device.createShaderModule({ label: "QA original GL-raw flow brush", code: rawFlowControlShader() }), pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "brush" } }), rect = canonicalDispatchRect(1536, 1536, scissor);
  const values = new Float32Array(24);
  values.set([1 / 1536, 1 / 1536, 1 / 1536, 1 / 1536, ...flowRect, gain, 0, 0, 0, ...scissor]);
  new Uint32Array(values.buffer).set(rect, 16);
  values.set([+(output === "color"), 0, 0, 0], 20);
  const u = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  try {
    device.queue.writeBuffer(u, 0, values);
    const entries = [{ binding: 0, resource: { buffer: u } }, ...[f.pigment, f.color, f.flow, f.water].map((field, k) => ({ binding: k + 1, resource: field.view })), { binding: 5, resource: ctx.linear }, { binding: 6, resource: f.out.view }], group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries }), pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(Math.ceil(rect[2] / 8), Math.ceil(rect[3] / 8));
    pass.end();
    return [u];
  } catch (e) {
    u.destroy();
    throw e;
  }
}

// docs/qa/harness/728-native-end-to-end/preBrush68Checkpoint.ts
var BRUSH68_ROI = { x: 269, y: 261, width: 127, height: 108 };
var BRUSH68_SCISSOR = [271, 1169, 123, 104];
var BRUSH68_FLOW_RECT = [272 / 1536, 1170 / 1536, 121 / 1536, 102 / 1536];

// docs/qa/harness/728-native-end-to-end/preBrush68Codec.ts
var hash = async (b) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b.slice().buffer)), (v) => v.toString(16).padStart(2, "0")).join("");
async function decodePreBrush68Checkpoint(packet) {
  if (!packet?.glOwnerRetired || packet.glError !== 0 || packet.lost !== false || !/^[a-f0-9]{40}$/.test(packet.code) || JSON.stringify(packet.roi) !== JSON.stringify(BRUSH68_ROI) || packet.rows?.length !== 6 || packet.flow?.width !== 31 || packet.flow?.height !== 26 || packet.flow?.filter !== "linear" || packet.brushCalls?.length !== 2) throw Error("Strict prebrush passport/geometry");
  const decode = async (r, n) => {
    if (r.rawBytes !== n || !/^[a-f0-9]{64}$/.test(r.sha256) || !/^[a-f0-9]{64}$/.test(r.gzipSha256) || typeof r.gzipBase64 !== "string" || r.gzipBase64.length > 4 * Math.ceil((n + 8192) / 3)) throw Error("Prebrush raw/gzip bounds");
    const gz = Uint8Array.from(atob(r.gzipBase64), (x) => x.charCodeAt(0));
    if (await hash(gz) !== r.gzipSha256) throw Error("Prebrush compressed checksum");
    const reader = new Blob([gz.buffer]).stream().pipeThrough(new DecompressionStream("gzip")).getReader(), bytes = new Uint8Array(n);
    let offset = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (offset + value.length > n) throw Error("Prebrush inflate exceeds bound");
        bytes.set(value, offset);
        offset += value.length;
      }
    } finally {
      await reader.cancel().catch(() => {
      });
    }
    if (offset !== n || await hash(bytes) !== r.sha256) throw Error("Prebrush raw checksum");
    return bytes;
  };
  const rows = [];
  for (let i = 0; i < 6; i++) {
    const r = packet.rows[i];
    if (r.phase !== (i < 3 ? "before" : "after") || r.role !== ["a", "cc", "coverage"][i % 3] || r.width !== 1536 || r.height !== 1536 || r.filter !== "nearest") throw Error("Prebrush role/order/filter");
    rows.push({ ...r, bytes: await decode(r, 127 * 108 * 4) });
  }
  for (let i = 0; i < 2; i++) {
    const c = packet.brushCalls[i];
    if (c.source !== ["cc", "a"][i] || c.radius !== 4 || c.scale !== 1 || c.gain !== 0.6437950134277344 || JSON.stringify(c.scissor) !== JSON.stringify(BRUSH68_SCISSOR) || JSON.stringify(c.flowRect) !== JSON.stringify(BRUSH68_FLOW_RECT)) throw Error("Original dualpass brush recipe");
  }
  const flow = await decode(packet.flow, 3224);
  if (await hash(flow) !== "3be5473ac4b1fbe38bc49c2ffc943126572e988416f5b9b3694cd6e511bee43b") throw Error("Original flow checksum");
  return { rows, flow, roi: BRUSH68_ROI, scope: "ROI-only prebrush common input; outside halo not captured, fullfield SHA not claimed" };
}

// docs/qa/harness/728-native-end-to-end/preBrush68NativeGate.ts
var hash2 = async (b) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b.slice().buffer)), (v) => v.toString(16).padStart(2, "0")).join("");
async function runPreBrush68NativeGate(packet, diagnosticRawGlFlow = false) {
  const p = packet, input = await decodePreBrush68Checkpoint(p);
  if (!navigator.gpu) throw Error("WebGPU unsupported explicitly");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw Error("WebGPU adapter unavailable");
  const device = await adapter.requestDevice(), textures = [], buffers = [], errors = [];
  let lost = false;
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  void device.lost.then((x) => {
    if (x.reason !== "destroyed") lost = true;
  });
  const make = (label, width, height, filter) => {
    const texture = device.createTexture({ label, size: [width, height], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST });
    textures.push(texture);
    return { label, width, height, filter, format: "rgba8unorm", texture, view: texture.createView() };
  };
  try {
    device.pushErrorScope("validation");
    const pigment = make("COMMON original oldP", 1536, 1536, "nearest"), color = make("COMMON original oldC", 1536, 1536, "nearest"), water = make("COMMON original water", 1536, 1536, "nearest"), outP = make("contact P output", 1536, 1536, "nearest"), outC = make("contact C output", 1536, 1536, "nearest"), flow = make("original GLflow", 31, 26, "linear"), r = BRUSH68_ROI;
    for (const [i, field] of [pigment, color, water].entries()) device.queue.writeTexture({ texture: field.texture, origin: [r.x, r.y] }, input.rows[i].bytes, { bytesPerRow: r.width * 4, rowsPerImage: r.height }, [r.width, r.height]);
    const flipped = new Uint8Array(input.flow.length);
    for (let y = 0; y < 26; y++) flipped.set(input.flow.subarray((25 - y) * 31 * 4, (26 - y) * 31 * 4), y * 31 * 4);
    device.queue.writeTexture({ texture: flow.texture }, diagnosticRawGlFlow ? input.flow : flipped, { bytesPerRow: 124, rowsPerImage: 26 }, [31, 26]);
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToTexture({ texture: pigment.texture }, { texture: outP.texture }, [1536, 1536]);
    encoder.copyTextureToTexture({ texture: color.texture }, { texture: outC.texture }, [1536, 1536]);
    const linear = device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" }), nearest = device.createSampler({ magFilter: "nearest", minFilter: "nearest" }), ctx = { device, encoder, linear, nearest }, brush = new CanonicalBrushContact(device, true);
    const encode = (fields, output) => diagnosticRawGlFlow ? encodeRawFlowBrush(ctx, fields, output, 0.6437950134277344, BRUSH68_FLOW_RECT, BRUSH68_SCISSOR) : brush.encodeSingle(ctx, fields, output, [1 / 1536, 1 / 1536], 0.6437950134277344, BRUSH68_FLOW_RECT, BRUSH68_SCISSOR);
    buffers.push(...encode({ pigment, color, flow, water, out: outC }, "color"));
    buffers.push(...encode({ pigment, color, flow, water, out: outP }, "pigment"));
    const pitch = Math.ceil(r.width * 4 / 256) * 256, readbacks = [outP, outC].map((field) => {
      const b = device.createBuffer({ size: pitch * r.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      buffers.push(b);
      encoder.copyTextureToBuffer({ texture: field.texture, origin: [r.x, r.y] }, { buffer: b, bytesPerRow: pitch, rowsPerImage: r.height }, [r.width, r.height]);
      return b;
    });
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    const comparisons = [];
    for (let i = 0; i < 2; i++) {
      const b = readbacks[i];
      await b.mapAsync(GPUMapMode.READ);
      const mapped = new Uint8Array(b.getMappedRange()), actual = new Uint8Array(r.width * r.height * 4);
      for (let y = 0; y < r.height; y++) actual.set(mapped.subarray(y * pitch, y * pitch + r.width * 4), y * r.width * 4);
      b.unmap();
      const expected = input.rows[3 + i].bytes, channels = Array.from({ length: 4 }, () => ({ changed: 0, max: 0, sum: 0 })), examples = [];
      for (let k = 0; k < actual.length; k++) {
        const d = Math.abs(actual[k] - expected[k]), c = channels[k % 4];
        if (d) {
          c.changed++;
          if (examples.length < 32) examples.push({ x: r.x + Math.floor(k / 4) % r.width, y: r.y + Math.floor(k / 4 / r.width), channel: k % 4, expected: expected[k], actual: actual[k] });
        }
        c.max = Math.max(c.max, d);
        c.sum += d;
      }
      comparisons.push({ role: ["a", "cc"][i], channels, examples, expectedSha256: await hash2(expected), actualSha256: await hash2(actual), exact: channels.every((c) => c.changed === 0) });
    }
    const validation = (await device.popErrorScope())?.message ?? null;
    return { code: "09351c4cf6cda0be206a29440fabc115ce9a688d", producerCode: p.code, diagnosticRawGlFlow, flowOrientation: diagnosticRawGlFlow ? "GL-raw rows + direct localUV" : "world-top rows + reflected localUV", operationSha256: p.operationSha256, paperSha256: p.paperSha256, roi: r, flowSha256: p.flow.sha256, comparisons, errors, lost, validation, scope: "One original brush68 C+P contact, COMMON actual GL precontact fields. Full1536 UV/filter/scissor preserved; only bounded ROI+2px halo initialized. Output material pair starts as oldP/C to model original region copyback; no claims outside ROI, actual working-field output siblings, whole solver, Room or performance." };
  } finally {
    await device.queue.onSubmittedWorkDone().catch(() => {
    });
    buffers.forEach((b) => b.destroy());
    textures.forEach((t) => t.destroy());
    device.destroy();
  }
}
async function runPreBrush68FlowControl(packet) {
  const baseline = await runPreBrush68NativeGate(packet, false), raw = await runPreBrush68NativeGate(packet, true);
  return { code: "09351c4cf6cda0be206a29440fabc115ce9a688d", arms: [baseline, raw], errors: [...baseline.errors, ...raw.errors], lost: baseline.lost || raw.lost, validation: baseline.validation ?? raw.validation, scope: "QA OFF control: only flow row/UV orientation changes; two sequential native owners, same actual common oldP/C/water and unchanged fraction/floor body" };
}
export {
  runPreBrush68FlowControl,
  runPreBrush68NativeGate
};
