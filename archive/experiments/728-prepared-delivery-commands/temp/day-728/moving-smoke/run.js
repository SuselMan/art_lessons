// apps/web/src/engine/src/webgpuCanonical/noise.ts
var CANONICAL_NOISE_WGSL = `
  fn wcLattice(p:vec2f)->f32 {
    return textureLoad(noiseTex,vec2i(p-floor(p/251.0)*251.0),0).r;
  }
  fn hash(p:vec2f)->f32 {
    return wcLattice(floor(p * 4.0));
  }
  fn wcNoise(p:vec2f)->f32 {
    var i:vec2f = floor(p);
    var f:vec2f = fract(p);
    var u:vec2f = f * f * (3.0 - 2.0 * f);
    var a:f32 = wcLattice(i);
    var b:f32 = wcLattice(i + vec2f(1.0, 0.0));
    var c:f32 = wcLattice(i + vec2f(0.0, 1.0));
    var d:f32 = wcLattice(i + vec2f(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  fn wcFbm(p:vec2f)->f32 {
    return 0.63 * wcNoise(p) + 0.37 * wcNoise(p * 2.7 + vec2f(31.4, 17.9));
  }
  fn wcPoolness(puddle:f32, paperWet:f32, on:f32)->f32 {
    return on * smoothstep(0.5, 0.95, puddle) * (1.0 - clamp(paperWet, 0.0, 1.0));
  }
  fn wcPoolBlot(wp:vec2f, seed:vec2f, puddle:f32, paperWet:f32, on:f32)->f32 {
    var pool:f32 = on * clamp(puddle, 0.0, 1.0);
    if (pool <= 0.0) { return 1.0; }
    var n:f32 = wcFbm(wp * 0.03 + seed * 1.7 + vec2f(13.0, 5.0));
    return mix(1.0, 0.4 + 1.2 * smoothstep(0.3, 0.7, n), pool);
  }
fn wcFilmBlot(wp:vec2f, seed:vec2f, puddle:f32, paperWet:f32, on:f32, brushWater:f32, pigmentOn:f32)->f32 {
    if (pigmentOn < 0.5) { return wcPoolBlot(wp, seed, puddle, paperWet, on); }
    var pool:f32 = on * clamp(max(puddle, 0.0 * clamp(brushWater, 0.0, 1.0) * (1.0 - clamp(paperWet, 0.0, 1.0))), 0.0, 1.0);
    if (pool <= 0.0) { return 1.0; }
    var n:f32 = wcFbm(wp * 0.055 + seed * 1.7 + vec2f(13.0, 5.0));
    return 1.0 + pool * 0.85 * (2.0 * smoothstep(0.3, 0.7, n) - 1.0);
}
  fn wcCloud(wp:vec2f, seed:vec2f, amount:f32)->f32 {
    if (amount <= 0.0) { return 1.0; }
    return 1.0 + amount * (wcFbm(wp * 0.018 + seed) - 0.5) * 2.0;
  }
  fn wcSettling(wp:vec2f, seed:vec2f, amount:f32)->f32 {
    if (amount <= 0.0) { return 1.0; }
    var n:f32 = wcFbm(wp * 0.11 + seed + vec2f(19.0, 71.0)) - 0.5;
    n = select(n * 1.6,n * 0.5,n < 0.05);
    return max(1.0 + amount * n * 2.0, 0.0);
  }
  const WC_STANDING_LO:f32 = 0.04;
  const WC_STANDING_HI:f32 = 0.35;
  fn wcStandingGate(brushWater:f32, washWater:f32)->f32 {
    return smoothstep(WC_STANDING_LO, WC_STANDING_HI, brushWater / max(washWater, 1e-4));
  }
  const WC_HAIR_WET_LO:f32 = 0.25;
  const WC_HAIR_WET_HI:f32 = 0.75;
  fn wcHairAmp(bristleInk:f32, brushWater:f32)->f32 {
    return min(1.0, bristleInk * 1.6) * (1.0 - smoothstep(WC_HAIR_WET_LO, WC_HAIR_WET_HI, brushWater));
  }
  fn wcHairComb(hair:f32, amp:f32)->f32 {
    return mix(1.0, 2.0 * smoothstep(0.3, 0.7, hair), amp);
  }
  const WC_HAIR_DRIFT_SCALE:f32 = 0.0012;
  const WC_HAIR_DRIFT_GAIN:f32 = 0.9;
  fn wcHairField(across:f32, combs:f32, wp:vec2f)->f32 {
    var drift:f32 = wcFbm(wp * WC_HAIR_DRIFT_SCALE + vec2f(71.0, 13.0));
    return wcFbm(vec2f(across * combs, drift * WC_HAIR_DRIFT_GAIN) + vec2f(3.0, 29.0));
  }
  fn wcTipPressure(pressure:f32, radius:f32)->f32 {
    if (pressure <= 0.0) { return 0.0; }
    return max(pressure, 0.06 * (1.0 - smoothstep(1.0, 2.0, radius)));
  }
  fn wcTipContact(across:f32, combs:f32, wp:vec2f, pressure:f32)->f32 {
    if (combs <= 0.0) { return 1.0; }
    var hair:f32 = wcHairField(across, combs, wp);
    var light:f32 = 1.0 - smoothstep(0.12, 0.70, pressure);
    var release:f32 = 1.0 - smoothstep(0.012, 0.060, pressure);
    var threshold:f32 = mix(mix(0.34, 0.39, light), 0.62, release);
    var opening:f32 = smoothstep(0.55, 0.72, wcNoise(wp * 0.009 + vec2f(37.0, 91.0)));
    var contact:f32 = mix(1.0, smoothstep(threshold - 0.02, threshold + 0.02, hair), max(opening, release));
    return contact * smoothstep(0.0, 0.012, pressure);
  }
`;

// apps/web/src/engine/src/webgpuCanonical/stamp.ts
var CANONICAL_STAMP_WGSL = `
struct U { resolution:vec2f, worldOrigin:vec2f, seed:vec2f, aa:f32, wash:f32,
 retain:f32, combs:f32, bristle:f32, cloud:f32, gran:f32, blot:f32, available:f32, pad:f32, tau:vec4f,
 pose:vec4f, shape:vec4f, paint:vec4f, contact:vec4f, clip:vec4f }
@group(0) @binding(0) var<uniform> u:U;
@group(0) @binding(1) var coverageTex:texture_2d<f32>;
@group(0) @binding(2) var noiseTex:texture_2d<f32>;
${CANONICAL_NOISE_WGSL}
struct V { @builtin(position) position:vec4f,@location(0) local:vec2f }
@vertex fn vs(@builtin(vertex_index) n:u32)->V {
 let corners=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));let uv=corners[n];
 let c=cos(u.shape.x);let s=sin(u.shape.x);let scaled=uv*vec2f(u.pose.w,1.0);
 let p=vec2f(scaled.x*c-scaled.y*s,scaled.x*s+scaled.y*c)*u.pose.z+u.pose.xy;
 var o:V;o.position=vec4f(p/u.resolution*vec2f(2.0,-2.0)+vec2f(-1.0,1.0),0,1);o.local=uv;return o;
}
fn nibDistance(v:V)->f32 {
 let b=max(u.pose.z,1e-4);let a=b*max(u.pose.w,1.0);
 if(u.shape.y>0.5) {
  let lp=v.local*vec2f(a,b);let r=min(u.shape.z,min(a,b));let q=abs(lp)-vec2f(a,b)+r;
  return min(max(q.x,q.y),0.0)+length(max(q,vec2f(0)))-r;
 }
 let f=dot(v.local,v.local);let grad=2.0*v.local/vec2f(a,b);return (f-1.0)/max(length(grad),1e-6);
}
fn across(v:V)->f32 {let b=max(u.pose.z,1e-4);let axes=vec2f(b*max(u.pose.w,1.0),b);return clamp(dot(v.local*axes,u.contact.xy)/max(length(axes*u.contact.xy),1e-4),-1,1);}
fn wp(v:V)->vec2f {return vec2f(v.position.x,u.resolution.y-v.position.y)+u.worldOrigin;}
fn covered(v:V)->vec4f {return textureLoad(coverageTex,clamp(vec2i(v.position.xy),vec2i(0),vec2i(textureDimensions(coverageTex))-1),0);}
@fragment fn coverage(v:V)->@location(0) vec4f {
 var cov=clamp(-nibDistance(v)/u.aa,0,1);if(cov<=0){discard;}
 let a=across(v);cov*=wcTipContact(a,u.combs,wp(v),wcTipPressure(u.contact.z,u.pose.z));
 return vec4f((a*.5+.5)*cov,cov*wcPoolness(u.paint.w,u.paint.y,u.blot),cov*max(u.paint.y,u.wash*mix(u.retain,1.0,u.paint.y)*wcStandingGate(u.paint.x,u.wash)),cov);
}
struct InkOut { @location(0) pigment:vec4f,@location(1) color:vec4f }
fn paint(v:V)->InkOut {
 let distance=nibDistance(v);let cov=clamp(-distance/u.aa,0,1);if(cov<=0){discard;}
 let depth=clamp(-distance/max(u.pose.z,1e-4)*2.0,0,1);
 var amount=cov*mix(u.contact.w,1.0,depth)*u.shape.w;
 let a=across(v);let world=wp(v);
 if(u.bristle>0){amount*=wcHairComb(wcHairField(a,u.combs,world),wcHairAmp(u.bristle,u.paint.x));}
 amount*=wcTipContact(a,u.combs,world,wcTipPressure(u.contact.z,u.pose.z));
 let cv=covered(v);if(u.clip.x>0.5&&u.clip.x<1.5){amount*=cv.a;}
 var wet=u.paint.y;if(u.clip.x>1.5){wet=clamp(cv.b/max(cv.a,0.002),0,1);}
 amount*=wcCloud(world,u.seed,u.cloud)*wcSettling(world,u.seed,u.gran)*wcFilmBlot(world,u.seed,u.clip.y,wet,u.blot,u.paint.x,step(5e-7,abs(u.paint.z)));
 var o:InkOut;o.pigment=vec4f(amount*u.paint.x,amount*wet,amount*u.paint.z,amount);o.color=vec4f(amount*u.paint.z*u.tau.xyz/4.0,amount*u.paint.z);return o;
}
@fragment fn ink(v:V)->InkOut{return paint(v);}
@fragment fn pigmentOnly(v:V)->@location(0) vec4f{return paint(v).pigment;}
@fragment fn colorOnly(v:V)->@location(0) vec4f{return paint(v).color;}

`;

// apps/web/src/engine/src/webgpuCanonical/deposit.ts
var CANONICAL_RIBBON_WGSL = `
struct U { resolution:vec2f, worldOrigin:vec2f, seed:vec2f, aa:f32, wash:f32,
 retain:f32, combs:f32, bristle:f32, cloud:f32, gran:f32, blot:f32, available:f32, pad:f32, tau:vec4f }
@group(0) @binding(0) var<uniform> u:U;
@group(0) @binding(1) var availableTex:texture_2d<f32>;
@group(0) @binding(2) var noiseTex:texture_2d<f32>;
${CANONICAL_NOISE_WGSL}
struct VIn { @location(0) position:vec2f,@location(1) edge:f32,@location(2) ink:f32,
 @location(3) water:f32,@location(4) across:f32,@location(5) wet:f32,
 @location(6) strength:f32,@location(7) contact:vec3f }
struct VOut { @builtin(position) position:vec4f,@location(0) edge:f32,@location(1) ink:f32,
 @location(2) water:f32,@location(3) across:f32,@location(4) wet:f32,
 @location(5) strength:f32,@location(6) contact:vec3f }
@vertex fn vs(v:VIn)->VOut {
 var o:VOut;let p=floor(v.position*64.0+0.5)/64.0;
 o.position=vec4f(p/u.resolution*vec2f(2.0,-2.0)+vec2f(-1.0,1.0),0,1);
 o.edge=v.edge;o.ink=v.ink;o.water=v.water;o.across=v.across;o.wet=v.wet;
 o.strength=v.strength;o.contact=v.contact;return o;
}
fn canonicalWp(v:VOut)->vec2f { return vec2f(v.position.x,u.resolution.y-v.position.y)+u.worldOrigin; }
fn availableWet(v:VOut)->f32 {
 let dims=vec2i(textureDimensions(availableTex));
 let a=textureLoad(availableTex,clamp(vec2i(v.position.xy),vec2i(0),dims-1),0);
 if(u.available>0.5){return clamp(a.b/max(a.a,0.002),0,1);}
 if(v.ink>5e-7){return v.wet/v.ink;}return 0;
}
@fragment fn coverage(v:VOut)->@location(0) vec4f {
 let cov=clamp(v.edge/u.aa,0,1);if(cov<=0){discard;}
 let wp=canonicalWp(v);let wet=clamp(availableWet(v),0,1);
 var water=0.0;if(v.ink>5e-7){water=clamp(v.water/v.ink,0,1);}
 let amount=cov*wcTipContact(v.across,u.combs,wp,v.contact.y);
 let standing=max(wet,u.wash*mix(u.retain,1.0,wet)*wcStandingGate(water,u.wash));
 return vec4f((v.across*.5+.5)*amount,amount*wcPoolness(v.contact.x,wet,u.blot)*step(0.0,v.strength),amount*standing,amount);
}
struct InkOut { @location(0) pigment:vec4f,@location(1) color:vec4f }
fn paint(v:VOut)->InkOut {
 let cov=clamp(v.edge/u.aa,0,1);if(cov<=0){discard;}
 let wp=canonicalWp(v);let wet=clamp(availableWet(v),0,1);
 var water=0.0;if(v.ink>5e-7){water=clamp(v.water/v.ink,0,1);}
 let mottle=wcCloud(wp,u.seed,u.cloud)*wcSettling(wp,u.seed,u.gran)*wcFilmBlot(wp,u.seed,v.contact.z,wet,u.blot,water,step(5e-7,abs(v.strength)));
 var amount=cov*v.ink*mottle*wcTipContact(v.across,u.combs,wp,v.contact.y);
 if(u.bristle>0){amount*=wcHairComb(wcHairField(v.across,u.combs,wp),wcHairAmp(u.bristle,water));}
 let strength=abs(v.strength)/max(v.ink,5e-7);var o:InkOut;
 o.pigment=vec4f(amount*water,amount*wet,amount*strength,amount);
 o.color=vec4f(amount*strength*u.tau.xyz/4.0,amount*strength);return o;
}
@fragment fn ink(v:VOut)->InkOut{return paint(v);}
@fragment fn pigmentOnly(v:VOut)->@location(0) vec4f{return paint(v).pigment;}
@fragment fn colorOnly(v:VOut)->@location(0) vec4f{return paint(v).color;}

`;
var layout = { arrayStride: 44, attributes: [
  { shaderLocation: 0, offset: 0, format: "float32x2" },
  ...Array.from({ length: 6 }, (_, k) => ({ shaderLocation: k + 1, offset: 8 + k * 4, format: "float32" })),
  { shaderLocation: 7, offset: 32, format: "float32x3" }
] };

// docs/qa/harness/728-room-moment/heldStampVariants.ts
var threshold = "mix(mix(0.34, 0.39, light), 0.62, release)";
var opening = "smoothstep(0.55, 0.72, wcNoise(wp * 0.009 + vec2f(37.0, 91.0)))";
function tipVariantShader(shader, variant) {
  if (variant === "literal") return shader;
  if (shader.split(threshold).length !== 2 || shader.split(opening).length !== 2) throw Error("Tip diagnostic anchors changed");
  if (variant === "A") return shader.replace(threshold, "mix(mix(0.28, 0.39, light), 0.62, release)");
  return shader.replace(opening, "smoothstep(mix(0.65, 0.55, light), mix(0.82, 0.72, light), wcNoise(wp * 0.009 + vec2f(37.0, 91.0)))");
}

// docs/qa/harness/728-room-moment/movingCompileSmoke.ts
async function compileMovingContact() {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw Error("No adapter");
  const device = await adapter.requestDevice(), records = [];
  device.pushErrorScope("validation");
  try {
    for (const variant of ["literal", "A"]) for (const [kind, source] of [["stamp", CANONICAL_STAMP_WGSL], ["ribbon", CANONICAL_RIBBON_WGSL]]) {
      const module = device.createShaderModule({ code: tipVariantShader(source, variant) }), info = await module.getCompilationInfo();
      const messages = info.messages.filter((m) => m.type === "error").map((m) => m.message);
      const formats = ["float32x2", "float32", "float32", "float32", "float32", "float32", "float32", "float32x3"], offsets = [0, 8, 12, 16, 20, 24, 28, 32];
      for (const entryPoint of ["coverage", "pigmentOnly", "colorOnly"]) await device.createRenderPipelineAsync({ layout: "auto", vertex: { module, entryPoint: "vs", buffers: kind === "ribbon" ? [{ arrayStride: 44, attributes: formats.map((format, i) => ({ format, offset: offsets[i], shaderLocation: i })) }] : [] }, fragment: { module, entryPoint, targets: [{ format: "rgba8unorm" }] } });
      records.push({ variant, kind, messages });
    }
    const error = await device.popErrorScope();
    return { records, errors: error ? [error.message] : [], scope: "Software compile/pipeline smoke only; no fields/draws/source orchestration/quality or hardware claim." };
  } finally {
    device.destroy();
  }
}
export {
  compileMovingContact
};
