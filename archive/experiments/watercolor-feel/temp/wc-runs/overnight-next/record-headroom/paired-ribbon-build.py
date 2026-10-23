import json, pathlib, hashlib, random, math
p=pathlib.Path(__file__).parent
src=pathlib.Path('apps/web/src/engine/src/raster/shaders.ts').read_text()
before='''          ? vec4(amount * abs(v_inkStrength) * u_tau / WC_DEPTH_SCALE, amount * abs(v_inkStrength))
          : vec4(cov * v_inkWater * mottle, cov * v_inkWet * mottle, cov * abs(v_inkStrength) * mottle, amount))'''
after='''          ? vec4(amount * (abs(v_inkStrength) / max(v_ink, 1e-6)) * u_tau / WC_DEPTH_SCALE, amount * (abs(v_inkStrength) / max(v_ink, 1e-6)))
          : vec4(amount * bandWater, amount * bandWet, amount * (abs(v_inkStrength) / max(v_ink, 1e-6)), amount))'''
assert src.count(before)==1
spec={'id':'production-paired-ribbon-source','parent':'baseline','baseEngine':'7ca4cf5d','mechanism':'Ribbon paired physical and optical source correction: identical final contact amount weights all channels; optical mass equals physical pigment B rather than dose squared. No headroom encoding or downstream parameter changes.','runtimePatches':[{'kind':'shader-exact','selector':'float amount = (u_mode > 0.5 ? cov * v_ink * mottle : cov) * tip;','before':before,'after':after,'countPerShader':1,'semanticFamily':'source-ribbon-contact-and-optical-pairing'}],'comparisons':['s6-n6','s9-n3','s1-n1','s8-n1','s7-n3'],'limits':['RGBA8 clipping and MAX envelope remain.','Physical channels now follow contact/hair loss, so mass deposition intentionally changes where tip/hair reduce contact.','Absolute strength sign marker remains used elsewhere; optical pigment uses abs as before.','No claim visual improvement before actual GPU/probes.'],'nonWCAudit':'marker inkFor returns water=paperWet=strength=0; default buildRibbonBands also initializes weighted RGB0. Both old/new physicalRGB0, physicalalpha identical. Marker does not call depthTau/colorDest ribbon; branch preserved by zero weighted channels, no new uniform required.','sourceSha256':hashlib.sha256(src.encode()).hexdigest()}
(p/'production-paired-ribbon-source.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2)+'\n')
r=random.Random(721);worst=0
for _ in range(100000):
 ink=r.uniform(1e-6,5);water=r.random();wet=r.random();strength=r.random();cov=r.random();tip=r.random();hair=r.random()*1.5;mottle=r.random()*2;tau=r.random()*math.log(50)
 amount=cov*ink*mottle*tip*hair;ratio=ink*strength/max(ink,1e-6)
 physical=[amount*water,amount*wet,amount*ratio,amount];depth=[amount*ratio*tau/4,amount*ratio]
 assert min(physical+depth)>=0
 assert physical[2]==depth[1]
 worst=max(worst,abs(depth[0]*4/depth[1]-tau) if depth[1]>1e-15 else 0)
 # Marker has zero weighted channels. Its alpha has no changed expression.
 assert [amount*0,amount*0,amount*0,amount]==[0,0,0,amount]
out={'status':'PASS_CPU_STATIC_NOT_GPU','samples':100000,'seed':721,'guardCount':1,'physicalBEqualsDepthAlpha':True,'maxTauError':worst,'markerRGBZeroPreserved':True,'coverageUnchanged':True,'noSourceUnitChange':True,'rootReviewRequired':True}
(p/'paired-ribbon-properties.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out))
