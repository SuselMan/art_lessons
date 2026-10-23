import json,pathlib,hashlib,random
p=pathlib.Path(__file__).parent;x=json.load(open(p/'production-headroom4.json'));orig=json.loads(json.dumps(x))
x['id']='production-headroom2';x['mechanism']='Half-scale paired physical/depth records before RGBA8 source writes, decode physical units, retain encoded room/FIT1 for physical capacity2. Diagnostic distinguishing quantization from clipping; not a winner and not pure unit invariance.'
for q in x['runtimePatches']:
 f=q.get('semanticFamily','CPU');a=q['after']
 if f=='CPU':assert a=='(profile.depositPerRadius * 0.25) *';a='(profile.depositPerRadius * 0.5) *'
 elif f=='source-band-depth-quadratic-compensation':a=a.removesuffix(' * 4.0')+' * 2.0'
 elif f=='source-band-ratio-epsilon':assert a=='v_ink > 2.5e-7';a='v_ink > 5e-7'
 elif f=='composite-WC-transport-decode':a='    a *= 0.5; // four-tap average then headroom record decode x2\n    float dep = a.a;'
 elif f in ['composite-WC-avg-decode','composite-WC-direct-decode','composite-WC-depth-decode','composite-WC-debug-decode']:assert a.count('* 4.0')==1;a=a.replace('* 4.0','* 2.0')
 elif f=='diffusion-shared-physical-density':assert a.count('(4.0 * texture2D')==2;a=a.replace('(4.0 * texture2D','(2.0 * texture2D')
 elif f in ['front-mode10-source-threshold','front-mode10-source-cost','old-fixed-paint-mask-mode4-only']:assert a.count('a.a * 4.0')==1;a=a.replace('a.a * 4.0','a.a * 2.0')
 elif f in ['carry-donor-mass-epsilon','carry-neighbour-mass-epsilon','remob-share-mass-epsilon','remob-peak-mass-epsilon','brush-donor-ratio-epsilon','brush-capacity-denominator-epsilon']:assert a.count('2.5e-5')==1;a=a.replace('2.5e-5','5e-5')
 else:raise ValueError(f)
 q['after']=a
# Preserve original before anchors and count guards byte-for-byte.
for a,b in zip(orig['runtimePatches'],x['runtimePatches']):
 for k in ['before','countPerShader','countPerResponse','selector','module','kind']:
  assert a.get(k)==b.get(k)
assert 'max(4.0 * donor, 5e-5)' in x['runtimePatches'][-1]['after']
assert 'u_k * 4.0' in x['runtimePatches'][9]['after']
x['proof']='Same18 guardedpatches as headroom4 with s=.5. Banddepth s squared times2 equals s. Composite/depth/density/source-threshold decode2. Mass eps half; geometriccoverage/paper eps untouched. WC_DEPTH_SCALE4, donor4 and front u_k*4 unchanged. Four-tap average coefficient .25×decode2=.5. Room/FIT1 deliberate physicalcapacity2.'
x['semanticChanges']=['Paired source records ×.5; band optical quadratic compensation ×2.','Physical decode ×2 at existing WC-only boundaries.','Mass eps ×.5, coverage/paper/ratio profiles unchanged.','Encoded room/FIT1 retains intentional physicalcapacity2.']
x['limits']=['Mass quantum2/255, optical depth quantum8/255.','Clips above2; MAX envelope unchanged.','Fresh replay only; persistentphysicalrecords incompatible.','No visual improvement claimed; headroom4 actualGPU rejected for posterization.']
x['productionStatus']='runtime diagnostic only, independent static+CPU review before rootGPU'
(p/'production-headroom2.json').write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
src=pathlib.Path('apps/web/src/engine/src/raster/shaders.ts').read_text();counts=[]
for q in x['runtimePatches']:
 if q['kind']=='shader-exact':assert src.count(q['before'])==q['countPerShader'];counts.append(src.count(q['before']))
r=random.Random(202);worst=0;quant=0
for _ in range(100000):
 m=r.random()*1.99;st=r.random();tau=r.random()*3.9;amount=m*r.random();old=amount*m*st*tau/4;enc=(amount*.5)*(m*st*.5)*2
 worst=max(worst,abs(enc*tau/4*2-old));assert abs(enc*tau/4*2-old)<1e-12
 quant=max(quant,abs(round(m*.5*255)/255*2-m))
assert quant<=1/255+1e-12
out={'status':'PASS_STATIC_CPU_NOT_GPU','patches':18,'shaderBeforeCounts':counts,'originalBeforeAnchorsPreserved':True,'protectedConstants':['WC_DEPTH_SCALE4','u_k*4 frontshape','brush donor4','coverageepsilon.002','room/FIT1'],'bandMaxError':worst,'massQuantizationMaxError':quant,'massQuantizationBound':1/255,'samples':100000,'specSha256':hashlib.sha256((p/'production-headroom2.json').read_bytes()).hexdigest()}
(p/'independent-headroom2-review.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
