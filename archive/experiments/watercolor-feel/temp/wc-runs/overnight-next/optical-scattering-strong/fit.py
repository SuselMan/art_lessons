import math,json,struct,random,re
from pathlib import Path
p=Path(__file__).parent;M=math.log(50)
f32=lambda x:struct.unpack('f',struct.pack('f',x))[0]
def white(k,s,d):
 if not d:return 1.
 if not k:return 1.
 l=k*d;q=s*d;h=math.sqrt(l*(l+2*q));e=math.exp(-h);z=-math.expm1(-2*h);den=(l+q)*z+h*(1+e*e);r=q*z/den;t=2*h*e/den;return r+t*t/(1-r)
def inv(y,s):
 if not y:return 0.
 target=math.exp(-y);lo=0.;hi=1.
 while white(hi,s,1)>target:hi*=2
 for _ in range(70):
  mid=(lo+hi)/2
  if white(mid,s,1)>target:lo=mid
  else:hi=mid
 return (lo+hi)/2/y
def poly(y,c):
 t=f32(2*f32(y)/M-1);b1=b2=0.
 for ci in c[:0:-1]:
  b=f32(f32(f32(2*t)*b1)-b2+f32(ci));b2=b1;b1=b
 return max(0,f32(f32(f32(t*b1)-b2+f32(c[0]))*f32(y)))
palette=json.loads((p/'palette.json').read_text());base=json.loads((p.parent/'transport-distance-audit/production-max-paired-headroom2-microcoupled-curvature10.json').read_text());template=json.loads((p.parent/'optical-scattering/production-km-finite-reference-poly12.json').read_text())['runtimePatches'][0];allfits=[]
for s in [1.,2.]:
 chosen=None
 for degree in [12,16]:
  n=degree;nodes=[math.cos(math.pi*(j+.5)/n) for j in range(n)];v=[inv((t+1)*M/2,s) for t in nodes];c=[2/n*sum(v[j]*math.cos(k*math.pi*(j+.5)/n) for j in range(n)) for k in range(n)];c[0]*=.5
  referr=0;monok=True;prevk=-1
  for i in range(10001):
   y=M*i/10000;k=poly(y,c);referr=max(referr,abs(white(k,s,1)-math.exp(-y)));monok&=k>=prevk-1e-7;prevk=k
  rng=random.Random(49);paletteerr=0;minimum=1.;maximum=0.;monom=True;premult=True
  for _ in range(10000):
   pa,pb=rng.sample(palette,2);mix=rng.random();colors=[math.exp(mix*math.log(max(.02,a))+(1-mix)*math.log(max(.02,b))) for a,b in zip(pa['color'],pb['color'])];strength=rng.random();ref=.5*max(strength,.004);tint=1+1.2*(1-sum(a*b for a,b in zip(colors,[.2126,.7152,.0722])))**4;ar=1-math.exp(-ref*tint/.54)
   rgb=[]
   for C in colors:
    target=1-ar*(1-C);y=-math.log(target);k=poly(y,c);paletteerr=max(paletteerr,abs(white(k,s,1)-target));mass=rng.random()*2;r=white(k,s,mass/ref);minimum=min(minimum,r);maximum=max(maximum,r);monom&=white(k,s,mass/ref+.01)<=r+1e-12;rgb.append(r)
   alpha=1-min(rgb);premult&=all(-1e-12<=R-(1-alpha)<=alpha+1e-12 for R in rgb)
  row={'Qref':s,'degree':degree,'coeffChebyshevAscending':c,'globalPoints':10001,'maxReferenceErrorFloat32':referr,'paletteChannels':30000,'paletteActualMixReferenceErrorFloat32':paletteerr,'KMonotone':monok,'massMonotone':monom,'premultBounds':premult,'minOutput':minimum,'maxOutput':maximum};allfits.append(row)
  if chosen is None and referr<2e-5 and paletteerr<2e-5 and monok:chosen=row
 if not chosen:chosen=allfits[-1]
 c=chosen['coeffChebyshevAscending'];code='        vec3 kmX = 2.0 * kmY / 3.912023005428146 - vec3(1.0);\n        vec3 kmB1 = vec3(0.0);\n        vec3 kmB2 = vec3(0.0);\n        vec3 kmTmp;\n'
 for coef in c[:0:-1]:code+=f'        kmTmp = 2.0 * kmX * kmB1 - kmB2 + vec3({coef:.15g});\n        kmB2 = kmB1; kmB1 = kmTmp;\n'
 code+=f'        vec3 kmK = max((kmX * kmB1 - kmB2 + vec3({c[0]:.15g})) * kmY, vec3(0.0));\n'
 patch=dict(template);patch['after']=re.sub(r'        vec3 kmK =.*?        vec3 kmResult;',code+'        vec3 kmResult;',patch['after'],flags=re.S).replace('float kmQ = 0.2 * kmThickness;',f'float kmQ = {s:.1f} * kmThickness;')
 id='production-physical22-km-scatter'+str(int(s));spec={**base,'id':id,'runtimePatches':base['runtimePatches']+[patch],'mechanism':f'Physical22 unchanged; full finitewhite KM Qref{s} inverse-calibrated to legacyfilm at massref=.5strength, global Chebyshev degree{chosen["degree"]}. No oldfixedpaint floor.', 'proof':chosen,'comparisons':['s8-n1','s6-n6','s9-n3','s1-n1','s7-n3'],'risks':['Globalphenomenological scattering, not measured spectral pigments.','Mixturetau is RGB absorption not calibrated K/S mixture;7controlmandatory.','Oldreference05patch excluded; physical22 parent untouched.','No LUT/newtextures/perpixel inverseiteration, but polynomial ALU can stress Adreno compiler.','Density/paint RGB reencoding precedes existing grain/coverage; physicalmass/coverage unchanged.','Runtimeanchors/shadercompile rootreview required; noGPU.']};(p/(id+'.json')).write_text(json.dumps(spec,indent=2))
(p/'cpu-fit-proof.json').write_text(json.dumps({'domainY':[0,M],'fits':allfits,'paletteCodes':[a['code'] for a in palette],'float32':'Clenshaw each operation explicit float32, no FMA. GLSL FMA/compiler may differ.'},indent=2))
print([(x['Qref'],x['degree'],x['maxReferenceErrorFloat32'],x['paletteActualMixReferenceErrorFloat32'],x['KMonotone']) for x in allfits])
