# DEFAULT-OFF visual-only render coverage: factory specification

**Not implemented/wired.** Activation waits for actual radial evidence of source-silhouette clipping. This document is a literal shader and owner contract, not a new production model.

Factory proposal: `createPreviewRenderCoverage(passes,{budgetBytes,contextGeneration})`. Constructor validates budget≥12MiB for three leases; allocates one own1024×1024 RGBA8 NEAREST field per preview slot. All input texture identities excluded from pool. Return `{field, encode({sourceCoverage,p,c,sourceEpoch,world}), retire(), releaseAfterKnownIdle(certificate), disposeAfterKnownIdle()}`. No GL-global patch/no installer flag here.

Inputs: `sourceCoverage`1024×1024 immutable, current transport-front P/C128×128 immutable for this draw, same bounded origin0/world1024. Output1024×1024 MUST NOT alias any input; framebuffer replacement, blend disabled, viewport1024, no depth/scissor state leaks. Old coverage NEAREST sampling at destination texel centres gives literal old Q8; P/C NEAREST normalized UV covers same world extent, no downsample of old material channels. Samplers explicit0/1/2, shader highp. Fragment specification:

```glsl
precision highp float;
uniform sampler2D u_sourceCoverage;
uniform sampler2D u_previewP;
uniform sampler2D u_previewC;
uniform vec2 u_resolution; //1024,1024
void main() {
  vec2 uv=gl_FragCoord.xy/u_resolution;
  vec4 old=texture2D(u_sourceCoverage,uv);
  vec4 p=texture2D(u_previewP,uv);
  vec4 c=texture2D(u_previewC,uv);
  bool material=p.b>0.0 && c.a>0.0 && max(c.r,max(c.g,c.b))>0.0;
  float ownWater=p.a>0.0 ? p.r/p.a :0.0;
  bool wet=max(ownWater,old.b)>0.004;
  if(!material || !wet || old.a>=1.0) { gl_FragColor=old; return; }
  float a=1.0; //diagnostic silhouette opening; NOT pigment dose
  vec2 rg=old.a>0.004 ? clamp(old.rg*a/old.a,0.0,1.0) : vec2(0.5*a,0.0);
  gl_FragColor=vec4(rg,old.b,a);
}
```

CPU byte oracle is `previewRenderCoverage.reference.mjs`. GPU UNORM rounding at exact half-code may differ from JS round; actual paired oracle should separately flag quantization instead of tolerating it silently. Full-alpha and reject branches copy literal sampled oldRGBA; partial-alpha changes across/pool encoded channels but preserves decoded ratios within rounding. Old.B standing is never scaled by alpha. Outsideold-alpha neutral across maps encoded128/255, yielding≈0.00392 decoded across; exactneutral0.5 cannot be represented in RGBA8. No assumption C≤P.B or RGB≤C.A.

Dry reject uses deposited own-water ratio and historical direct standingB, not rawV support. It is a conservative presentation eligibility rule, not current PaperWetness elapsed time. A genuinely dried old wash may still carry historical standingB; therefore this spec only operates during sealed pending-preview lifetime, never on arbitrary old-room material. To evaluate actual time-dependent dry state requires PaperWetness/owner epoch contract separately.

Ordering: select OLD front P/C pair → diffuse into NEWpair → successful complete swaps both → encode rendercoverage from that pair+current sourcecoverage → composite(original,rendercoverage,p,c) into ownpending → advance visible reveal. The output must never enter sourcefilm/planner/dryendpoint. One extra1024 draw/update; sourceCoverage4MiB/P-C128 reads, output4MiB. No CPUreadback or new DOWN fence. Cost unmeasured.

Source rebase: detach pending/retire old transport+render lease before sourceepoch changes. Do not reuse field acrossepochs without fresh encode. All lastGPUreferences participate in existing-known-idle serial ledger; release only after detach and matchingcontextgeneration completion. Contextloss disposes oldgeneration, factory rebuild required. Constructor allocation failure rolls back acquired fields/program; no leases return to engine pool. Dispose never creates hidden allocation/fence on input.

Required next actual gates after radial proof: sameP/C+oldsource literal versus generated coverage; water-only/dry reject; zero-optical-depth; weakQ8; boundedflatcolour; outsideold-domain visibility; oldsource8hashes unchanged; finalcanonical endpoint unchanged; exactsourceepoch/P-Cpair; noGLerrors/loss; currentpressure/materialprofile scalar passport. Do not present this as artifact-free/natural before image inspection.
