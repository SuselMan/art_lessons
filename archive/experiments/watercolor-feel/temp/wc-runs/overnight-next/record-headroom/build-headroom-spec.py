import json,hashlib
from pathlib import Path
root=Path(__file__).parent
src=Path('apps/web/src/engine/src/raster/shaders.ts').read_text()
patches=[{'kind':'vite-module-exact','module':'/src/engine/src/dabs/RibbonStrokePainter.ts','before':'profile.depositPerRadius *','after':'(profile.depositPerRadius * 0.25) *','countPerResponse':4}]
checks=[]
def add(family,selector,before,after,count=1):
 actual=src.count(before)
 if actual!=count:raise Exception(f'{family}: staticcount{actual} expected{count}: {before[:100]}')
 patches.append({'kind':'shader-exact','selector':selector,'before':before,'after':after,'countPerShader':count,'semanticFamily':family})
 checks.append({'family':family,'staticTSCount':actual,'expectedPerSelectedShader':count,'beforeSha256':hashlib.sha256(before.encode()).hexdigest()})
band='float amount = (u_mode > 0.5 ? cov * v_ink * mottle : cov) * tip;'
add('source-band-depth-quadratic-compensation',band,'? vec4(amount * abs(v_inkStrength) * u_tau / WC_DEPTH_SCALE, amount * abs(v_inkStrength))','? vec4(amount * abs(v_inkStrength) * u_tau / WC_DEPTH_SCALE, amount * abs(v_inkStrength)) * 4.0')
add('source-band-ratio-epsilon',band,'v_ink > 1e-6','v_ink > 2.5e-7',3)
comp='vec4 wcInkAvg(vec2 uv, vec2 texel, float rPx)'
add('composite-WC-avg-decode',comp,'return s * 0.0714286;','return (s * 0.0714286) * 4.0;')
add('composite-WC-transport-decode',comp,'    a *= 0.25;\n    float dep = a.a;','    a *= 1.0; // four-tap average then headroom record decode x4\n    float dep = a.a;')
add('composite-WC-direct-decode',comp,'        : texture2D(u_inkLoad, tileUV);','        : texture2D(u_inkLoad, tileUV) * 4.0;')
add('composite-WC-depth-decode',comp,'      vec4 depth = texture2D(u_inkColor, tileUV);','      vec4 depth = texture2D(u_inkColor, tileUV) * 4.0;')
add('composite-WC-debug-decode',comp,'        vec4 rawInk = texture2D(u_inkLoad, tileUV);','        vec4 rawInk = texture2D(u_inkLoad, tileUV) * 4.0;')
diff='uniform sampler2D u_density;'
old='float density = max(texture2D(u_density, v_uv).a / max(cov.a, 0.002), texture2D(u_density, uvj).a / max(covj.a, 0.002));'
add('diffusion-shared-physical-density',diff,old,old.replace('texture2D(u_density, v_uv).a /','(4.0 * texture2D(u_density, v_uv).a) /').replace('texture2D(u_density, uvj).a /','(4.0 * texture2D(u_density, uvj).a) /'))
field='const float WC_CARRY_TAPER = 1.6;'
add('front-mode10-source-threshold',field,'float m = 1.0 - smoothstep(u_k, u_k * 4.0, a.a);','float m = 1.0 - smoothstep(u_k, u_k * 4.0, a.a * 4.0);')
add('front-mode10-source-cost',field,'float cost = a.a > u_k ? mix(u_size.x, m * u_band.x, deep) : 1.0;','float cost = a.a * 4.0 > u_k ? mix(u_size.x, m * u_band.x, deep) : 1.0;')
old='''      float m = smoothstep(u_k, u_k * 4.0, a.a);
      gl_FragColor = vec4(m, 0.0, 0.0, 1.0);
      return;
    }
    if (u_mode > 2.5)'''
add('old-fixed-paint-mask-mode4-only',field,old,old.replace('u_k * 4.0, a.a)','u_k * 4.0, a.a * 4.0)'))
add('carry-donor-mass-epsilon',field,'/ max(m.a, 1e-4));','/ max(m.a, 2.5e-5));')
add('carry-neighbour-mass-epsilon',field,'/ max(mj.a, 1e-4));','/ max(mj.a, 2.5e-5));')
add('remob-share-mass-epsilon',field,'a.a / max(a.a + b.a, 1e-4)','a.a / max(a.a + b.a, 2.5e-5)',2)
add('remob-peak-mass-epsilon',field,'room / max(peak, 1e-4)','room / max(peak, 2.5e-5)',2)
brush='float flux(vec2 from, vec2 to, vec2 direction)'
add('brush-donor-ratio-epsilon',brush,'float mixFraction = 0.18 * max(donor - neighbour, 0.0) / max(donor, 1e-4);','float mixFraction = 0.18 * max(donor - neighbour, 0.0) / max(donor, 2.5e-5);')
add('brush-capacity-denominator-epsilon',brush,'return min(amount, room / max(4.0 * donor, 1e-4));','return min(amount, room / max(4.0 * donor, 2.5e-5));')
spec={'id':'production-headroom4','parent':'baseline','baseEngine':'7ca4cf5d','mechanism':'Quarter-scale paired physical/depth records before RGBA8 source writes, decode physical units for density and watercolor display, retain encoded capacity1 so physical capacity expands to4. Source headroom + deliberate capacity expansion, not a pure unit-equivalent baseline.','runtimePatches':patches,'comparisons':['s1-n1','s4-n1','s6-n6','s9-n3'],'proof':'Four watercolor-only profile.depositPerRadius source sites scale ALL paired physical and depth channels via existing shared ink amount parameters; geometry/coverage, water standing, paper height, cost, radius, optical swatch tau and DEPTH_SCALE4 unchanged. Diffusion reads shared pre-step pigment density decodedx4 for both records. Frontmode10/mode4 physicalalpha decoded; mode19 coverage unmodified. Carry/brush/remob ratio eps scale; room and FIT remain1 encoded (physical4). Composite decoded at WC-only helpers/direct/depth/debug reads. Guards count every exact anchor; no buffers or production source changes.','semanticChanges':['Source deposit/depth ALLchannels×.25 before sourcewrite, fresh replay required.','Physical density restored before nonlinear coefficient.','Physical mass mask/seeding threshold units restored, metadata/cost unchanged.','Carry/remob/brush ratio epsilon×.25.','Room/FIT kept1 encoded => expanded physical capacity4.','WC display physical/depth decodedx4; original density/tint/thinprior/migration math retained.'],'limits':['RGBA8 physical massquantum4/255, range0..4; low-mass quantization/underflow worse.','Still clips above4; quarter-source probe cross2cells saturated.','MAX upper-envelope overlaps remain discarded; this experiment cannot restore cumulative deposition.','Expandedcapacity changes recipient room/remobilization/tide FIT saturation, intentional diagnostic confound.','Not exactly unit-invariant: byte quantization and eliminated clipping materially alter curves/ratios.','Clean isolated replay only; never combine encodedrecords with old checkpoints.','No claim dark centre/structure improved until rendered with4fixture controls.'],'guardAudit':checks,'productionStatus':'experimental runtime only, root review required before GPU/publication'}
(root/'production-headroom4.json').write_text(json.dumps(spec,indent=2));print('Saved',len(patches),'patches')
