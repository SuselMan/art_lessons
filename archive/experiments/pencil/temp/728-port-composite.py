import re
from pathlib import Path
source=Path('apps/web/src/engine/src/raster/shaders.ts').read_text()
def block(s,start):
 a=s.index(start);n=0
 for i in range(s.index('{',a),len(s)):
  if s[i]=='{':n+=1
  if s[i]=='}':
   n-=1
   if n==0:return s[a:i+1]
core=block(source,'    if (u_inkMode > 8.5) {');core=core[core.index('{')+1:-1]
core=core.replace(block(core,'      if (u_migrate > 0.0) {'),'')
core=re.sub(r'/\*.*?\*/|//[^\n]*','',core,flags=re.S)
core=core.replace('vec4 ink = u_inkSmoothPx > 0.0\n        ? wcInkAvg(tileUV, texel, u_inkSmoothPx * 0.5)\n        : texture2D(u_inkLoad, tileUV) * 2.0;','vec4 ink = texture2D(u_inkLoad, tileUV) * 2.0;\nif(u_inkSmoothPx>0.0){ink=wcInkAvg(tileUV,texel,u_inkSmoothPx*.5);}')
core=core.replace('float waterHere = ink.a > 0.004 ? clamp(ink.r / ink.a, 0.0, 1.0) : u_water;','float waterHere=u_water;if(ink.a>0.004){waterHere=clamp(ink.r/ink.a,0.0,1.0);}')
core=core.replace('float strengthHere = ink.a > 0.004 ? clamp(ink.b / ink.a, 0.0, 1.0) : u_inkStrength;','float strengthHere=u_inkStrength;if(ink.a>0.004){strengthHere=clamp(ink.b/ink.a,0.0,1.0);}')
core=core.replace('float acrossN = rawCoverage > 0.004\n        ? clamp(texture2D(u_strokeCoverage, tileUV).r / rawCoverage, 0.0, 1.0) * 2.0 - 1.0\n        : 0.0;','float acrossN=0.0;if(rawCoverage>0.004){acrossN=clamp(texture2D(u_strokeCoverage,tileUV).r/rawCoverage,0.0,1.0)*2.0-1.0;}')
core=core.replace('vec3 effectiveBase = dst.a > 0.004 ? clamp(dst.rgb / dst.a, 0.0, 1.0) : vec3(1.0);','vec3 effectiveBase=vec3(1.0);if(dst.a>0.004){effectiveBase=clamp(dst.rgb/dst.a,vec3(0.0),vec3(1.0));}')
core=core.replace('float effectiveThickness = linearThickness <= 1.0 ? linearThickness : 1.0 + 0.6 * (1.0 - exp(-(linearThickness - 1.0) / 0.6));','float effectiveThickness=linearThickness;if(linearThickness>1.0){effectiveThickness=1.0+0.6*(1.0-exp(-(linearThickness-1.0)/0.6));}')
core=core.replace('paint = density > 0.0001 ? clamp((transmittance - vec3(1.0 - density)) / density, 0.0, 1.0) : vec3(1.0);','paint=vec3(1.0);if(density>0.0001){paint=clamp((transmittance-vec3(1.0-density))/density,vec3(0.0),vec3(1.0));}')
core=core.replace('pigment = clamp(u_wcDebugView < 1.5 ? coverage : u_wcDebugView < 2.5 ? density : u_wcDebugView < 3.5 ? ink.b * 3.0 : gateDbg, 0.0, 1.0);','float dbg=gateDbg;if(u_wcDebugView<1.5){dbg=coverage;}else if(u_wcDebugView<2.5){dbg=density;}else if(u_wcDebugView<3.5){dbg=ink.b*3.0;}pigment=clamp(dbg,0.0,1.0);')
core=core.replace('gl_FragColor = texture2D(u_original, tileUV);\n          return;','return texture2D(u_original,tileUV);').replace('gl_FragColor = vec4(premultResult, newAlpha);\n      return;','return vec4(premultResult,newAlpha);')
core=core.replace('for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) coarse += texture2D(u_paperHeightMap, paperUV + vec2(float(i), float(j)) * dTex).r;','for(var j=-1;j<=1;j++){for(var i=-1;i<=1;i++){coarse+=texture2D(u_paperHeightMap,paperUV+vec2(float(i),float(j))*dTex).r;}}')
helper=block(source,'  vec4 wcInkAvg(')+'\n'+block(source,'  float wcRingAvg(')
helper=helper.replace('vec2 bx = stagger > 0.5 ? vec2(C15, S15) : vec2(1.0, 0.0);','vec2 bx=vec2(1.0,0.0);if(stagger>0.5){bx=vec2(C15,S15);}')
constants='\n'.join(re.findall(r'  const float (?:WC_DENSITY_K|WC_TINT_DARK|WC_DRY_\w+|WC_WET_PUSH|WC_WET_GRAN|WC_PUSH_DRY|WC_WET_PAPER|C30|C15|S15) = [^;]+;',source))
mapping={'u_resolution':'u.a.xy','u_paperOrigin':'u.a.zw','u_paperTexSize':'u.b.xy','u_paperScale':'u.b.zw','u_fieldOffset':'u.c.xy','u_inkSmoothPx':'u.c.z','u_water':'u.c.w','u_inkStrength':'u.d.x','u_spreadPx':'u.d.y','u_edgeWander':'u.d.z','u_edgeSoft':'u.d.w','u_bristleCombs':'u.e.x','u_dryContact':'u.e.y','u_granulation':'u.e.z','u_wetEdgeRadiusPx':'u.f.x','u_wetEdge':'u.e.w','u_tideLo':'u.f.y','u_tideHi':'u.f.z','u_paperRim':'u.f.w','v_opacity':'u.g.x','u_pigmentOpacity':'u.g.y','u_wcDebugView':'u.g.z','u_rectComposite':'u.g.w'}
def convert(s):
 s=re.sub(r'/\*.*?\*/|//[^\n]*','',s,flags=re.S)
 s=re.sub(r'\b(float|vec2|vec3|vec4) (\w+)\(([^)]*)\)\s*\{',lambda m:'fn '+m[2]+'('+re.sub(r'\b(float|vec2|vec3|vec4) (\w+)',lambda a:a[2]+':'+({'float':'f32','vec2':'vec2f','vec3':'vec3f','vec4':'vec4f'}[a[1]]),m[3])+')->'+{'float':'f32','vec2':'vec2f','vec3':'vec3f','vec4':'vec4f'}[m[1]]+' {',s)
 s=re.sub(r'const float (\w+) =',r'const \1:f32 =',s)
 s=re.sub(r'\b(float|vec2|vec3|vec4) (\w+) =',lambda m:'var '+m[2]+':'+{'float':'f32','vec2':'vec2f','vec3':'vec3f','vec4':'vec4f'}[m[1]]+' =',s)
 s=s.replace('float(', 'f32(')
 for v in [2,3,4]:s=s.replace(f'vec{v}(',f'vec{v}f(')
 for k,v in mapping.items():s=s.replace(k,v)
 s=s.replace('gl_FragCoord.xy','glPx')
 s=s.replace('texture2D(u_paperHeightMap,','paperSample(')
 s=s.replace('texture2D(u_strokeCoverage,','field(coverageTex,').replace('texture2D(u_inkLoad,','field(pigmentTex,').replace('texture2D(u_inkColor,','field(colorTex,').replace('texture2D(u_original,','field(originalTex,')
 return re.sub(r'\n\s*\n','\n',s)
header='''import { CANONICAL_NOISE_WGSL } from './noise'\nexport const CANONICAL_COMPOSITE_WGSL = `\nstruct U { a:vec4f,b:vec4f,c:vec4f,d:vec4f,e:vec4f,f:vec4f,g:vec4f }\n@group(0) @binding(0) var<uniform> u:U;\n@group(0) @binding(1) var originalTex:texture_2d<f32>;\n@group(0) @binding(2) var coverageTex:texture_2d<f32>;\n@group(0) @binding(3) var pigmentTex:texture_2d<f32>;\n@group(0) @binding(4) var colorTex:texture_2d<f32>;\n@group(0) @binding(5) var paperTex:texture_2d<f32>;\n@group(0) @binding(6) var noiseTex:texture_2d<f32>;\n@group(0) @binding(7) var linearClamp:sampler;\n@group(0) @binding(8) var linearRepeat:sampler;\n${CANONICAL_NOISE_WGSL}\nconst WC_DEPTH_SCALE:f32=4.0;\nfn field(tex:texture_2d<f32>,uv:vec2f)->vec4f{return textureSampleLevel(tex,linearClamp,vec2f(uv.x,1.0-uv.y),0);}\nfn paperSample(uv:vec2f)->vec4f{return textureSampleLevel(paperTex,linearRepeat,uv,0);}\nstruct V { @builtin(position) p:vec4f }\n@vertex fn vs(@builtin(vertex_index) n:u32)->V {let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var o:V;o.p=vec4f(p[n],0,1);return o;}\n'''
body='\n@fragment fn fs(v:V)->@location(0) vec4f {let glPx=vec2f(v.p.x,u.a.y-v.p.y);let paperUV=(glPx+u.a.zw)/u.b.xy*u.b.zw;let paperCatch=paperSample(paperUV).a;\n'+convert(core)+'\n}\n`;\n'
Path('apps/web/src/engine/src/webgpuCanonical/compositeShader.ts').write_text(header+convert(constants)+'\n'+convert(helper)+body)
print('ternaries left',body.count('?'))
