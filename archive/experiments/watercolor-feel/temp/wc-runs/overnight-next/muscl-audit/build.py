import json,pathlib,random,math,numpy as np
p=pathlib.Path('temp/wc-runs/overnight-next');d=p/'muscl-audit';base=json.load(open(p/'transport-distance-audit/production-max-paired-headroom2-microcoupled-curvature10.json'));before='float amount = (0.6 * max(dot(velocity, direction), 0.0) + mixFraction) * min(flow.b, flowAt(to).b) * contact;'
for kind in ['firstorder','minmod']:
 x=json.loads(json.dumps(base));x['id']='production-physical22-adv04-'+kind;after=before.replace('(0.6 *','(0.4 *')
 if kind=='minmod':after='''vec2 backUV = from - direction * u_step;
    float backMass = donor;
    if (min(min(backUV.x, backUV.y), min(1.0 - backUV.x, 1.0 - backUV.y)) >= 0.0) backMass = texture2D(u_pigment, backUV).a;
    float leftSlope = donor - backMass;
    float rightSlope = neighbour - donor;
    float limitedSlope = leftSlope * rightSlope > 0.0 ? sign(leftSlope) * min(abs(leftSlope), abs(rightSlope)) : 0.0;
    float face = max(0.0, donor + 0.5 * limitedSlope);
    float faceRatio = donor > 0.0 ? face / max(donor, 5e-5) : 0.0;
    float amount = (0.4 * max(dot(velocity, direction), 0.0) * faceRatio + mixFraction) * min(flow.b, flowAt(to).b) * contact;'''
 x['runtimePatches'].append({'kind':'shader-exact','selector':'float flux(vec2 from, vec2 to, vec2 direction)','before':before,'after':after,'countPerShader':1});x['mechanism']='Physical22 MAX pairedsource/headroom2/micro/curvature with matchedadv.4 '+kind+', mix.02 unchanged.';x['proof']='Positiveboundedface, sharedphysical/depthscalarfraction; NO globalTVD/monotonicfieldtheorem.';x['observableOutcome']='Measurepeak/varianceblur vs matchedfirstorder.4, no guaranteedimprovement.';x['risks']=['No exactRGBA8massconservation orTVD claim.','1additionaltexturefetch/flux,8worstcase/fragment; Adrenocomplexityuntested.','MAX/headroom2/sourceclipping/curvatureaddedpigmentremain.'];(d/(x['id']+'.json')).write_text(json.dumps(x,indent=2)+'\n')
 s=(p/'transport-distance-audit/audit-max-micro.mts').read_text().replace('temp/wc-runs/overnight-next/transport-distance-audit/production-max-paired-headroom2-microcoupled.json',str(d/(x['id']+'.json'))).replace('temp/wc-runs/overnight-next/transport-distance-audit/max-headroom2-micro-shader-audit.json',str(d/(kind+'-shader-audit.json')));(d/f'audit-{kind}.mts').write_text(s)
r=random.Random(408);maxout=0
for _ in range(100000):
 own,back,to=[r.random() for i in range(3)];l=own-back;rr=to-own;slope=math.copysign(min(abs(l),abs(rr)),l) if l*rr>0 else 0;face=own+.5*slope;ratio=face/max(own,5e-5) if own>0 else 0;assert 0<=ratio<=1.5;ang=r.random()*math.tau;v=[2*round((math.cos(ang+i*math.pi/2)*.5+.5)*255)/255-1 for i in range(2)];out=.4*ratio*sum(map(abs,v))+.08;assert out<1;maxout=max(maxout,out)
toy=[];z=np.arange(256)
for shape in ['gaussian','triangle']:
 for height in [.2,.6]:
  initial=height*(np.exp(-((z-90)/6)**2/2) if shape=='gaussian' else np.maximum(1-abs(z-90)/12,0))
  def run(kind):
   m=initial.copy()
   for t in range(20):
    out=np.zeros_like(m)
    for direction in [-1,1]:
     nxt=np.roll(m,-direction);back=np.roll(m,direction);l=m-back;rr=nxt-m;slope=np.where(l*rr>0,np.sign(l)*np.minimum(abs(l),abs(rr)),0);face=m+.5*slope;ratio=face/np.maximum(m,5e-5) if kind=='minmod' else np.ones_like(m);f=(.4*max(direction,0)*ratio+.02*np.maximum(m-nxt,0)/np.maximum(m,5e-5));f=np.minimum(f,np.maximum(1-nxt,0)/np.maximum(4*m,5e-5));flux=m*f;out-=flux;out+=np.roll(flux,direction)
    m+=out;assert m.min()>-1e-12
   mass=m.sum();mean=(z*m).sum()/mass;return {'mass':float(mass),'massError':float(mass-initial.sum()),'variance':float(((z-mean)**2*m).sum()/mass),'peak':float(m.max()),'min':float(m.min())}
  toy.append({'shape':shape,'height':height,'firstorder':run('firstorder'),'minmod':run('minmod')})
(d/'properties.json').write_text(json.dumps({'samples':100000,'outflowBound':.4*1.5*(math.sqrt(2)+2/255)+.08,'observedMaxOutflow':maxout,'zeroOwnFace':0,'notTVDProof':True,'toy':toy,'toyScope':'1D periodic256 grid,20steps actualroom/(4donor)+mix.02, doublefloat notRGBA8','extraFetchesPerFlux':1,'extraFetchesPerFragment':8,'noGPU':True},indent=2)+'\n');print(json.dumps(toy))
