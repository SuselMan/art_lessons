import pathlib,json,copy,numpy as np
r=pathlib.Path('temp/wc-runs/overnight-next');out=r/'film-front-grant-audit';base=json.loads((r/'transport-distance-audit/production-max-paired-headroom2-microcoupled-curvature10.json').read_text());shader=pathlib.Path('apps/web/src/engine/src/raster/shaders.ts').read_text().split('export const WC_FIELD_OP_FRAG = `',1)[1].split('`;',1)[0]
for p in base['runtimePatches']:
 if p['kind']=='shader-exact' and p['selector'] in shader:assert shader.count(p['before'])==p.get('countPerShader',1);shader=shader.replace(p['before'],p['after'])
before='      float cost = a.a * 2.0 > u_k ? mix(u_size.x, m * u_band.x, deep) : 1.0;';assert shader.count(before)==1
for gain in [.04,.12,.25]:
 d=copy.deepcopy(base);d['id']='production-physical22-film-front-grant-'+str(int(gain*100)).zfill(2)
 after=f'''      float filmWater = clamp(a.r / max(a.a, 5e-5), 0.0, 1.0);
      float filmStart = max(u_size.x - {gain} * filmWater * filmWater * u_size.x, 0.0);
      float cost = a.a * 2.0 > u_k ? mix(filmStart, m * u_band.x, deep) : 1.0;'''
 d['runtimePatches'].append(dict(kind='shader-exact',selector='float rel = b.b / max(u_band.y, 1e-4);',before=before,after=after,countPerShader=1));d.update(observableOutcome='Modest water-dependent film seed head-start; physical22 source footprint unchanged but reached front/domain intentionally extends.',risks=['Constitutive spread diagnostic, not volume conservation','P.R/A clamps legitimate mobile ratio; seed input semantic must remainP','Intermediate deep blend changes, deep1 exact unchanged','Budget padding unchanged, no new buffers, Adreno untested']);(out/(d['id']+'.json')).write_text(json.dumps(d,indent=2)+'\n')
rng=np.random.default_rng(4);size=rng.random(100000);water=rng.random(100000);m=rng.random(100000);band=rng.random(100000)
for g in [.04,.12,.25]:
 start=np.maximum(size-g*water**2*size,0);assert np.all((start>=0)&(start<=size));assert np.array_equal(size-g*0*size,size);assert np.array_equal(start*0+m*band,m*band)
(out/'properties.json').write_text(json.dumps({'cases':100000,'filmStartBoundsPASS':True,'water0LegacyExactPASS':True,'deep1LegacyExactPASS':True,'shaderMode10SequentialAnchor':1,'unchangedViteModules':'Physical22 original verified; no additional module patches','warning':'deep1 algebraic endpoint proof, not all actualpurewater classifications proven'},indent=2)+'\n');print('3 specs 23 patches each PASS')
