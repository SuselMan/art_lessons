import json,pathlib,math,random,numpy as np
p=pathlib.Path('temp/wc-runs/overnight-next');d=p/'aggregation-audit';base=json.load(open(p/'transport-distance-audit/production-max-paired-headroom2-microcoupled-curvature10.json'));before='float amount = (0.6 * max(dot(velocity, direction), 0.0) + mixFraction) * min(flow.b, flowAt(to).b) * contact;'
for name,gamma in [('control',0),('025',.025),('040',.04)]:
 x={k:v for k,v in base.items()if k in ['parent','baseEngine','comparisons']};after=f'float aggregationFraction = {gamma} * clamp((neighbour - donor) / max(donor, 5e-5), 0.0, 1.0);\n    float amount = (0.5 * max(dot(velocity, direction), 0.0) + mixFraction + aggregationFraction) * min(flow.b, flowAt(to).b) * contact;';x['runtimePatches']=base['runtimePatches']+[{'kind':'shader-exact','selector':'float flux(vec2 from, vec2 to, vec2 direction)','before':before,'after':after,'countPerShader':1}];x['id']='production-physical22-brush-aggregation-'+name;x['mechanism']='Matched adv.5/mix.02 with brush-contact uphill concentration aggregationgamma '+str(gamma)+', carrier-based sharedfractions. Clusterheuristic, not physicalflocculation/CahnHilliard.';x['proof']='23flattenedbaselinepatches, positiveuphillfraction≤gamma, unchangedroom/4donor/source/coverage/optics; no pigmentcreation onzero donor. OriginalMAX source retained.';x['risks']=['Grid/checkerboard/anisotropicartifacts possible.','RGBA8 noexactglobalmass/TVD claim.','H2quantization/clipping/curvatureaddedsource unchanged.','Uphillheuristic notphysicalthermodynamics.'];(d/(x['id']+'.json')).write_text(json.dumps(x,indent=2)+'\n');s=(p/'transport-distance-audit/audit-max-micro.mts').read_text().replace('temp/wc-runs/overnight-next/transport-distance-audit/production-max-paired-headroom2-microcoupled.json',str(d/(x['id']+'.json'))).replace('temp/wc-runs/overnight-next/transport-distance-audit/max-headroom2-micro-shader-audit.json',str(d/(name+'-shader-audit.json')));(d/f'audit-{name}.mts').write_text(s)
r=random.Random(2540)
for _ in range(100000):
 angle=r.random()*math.tau;vel=[2*round((v*.5+.5)*255)/255-1 for v in [math.cos(angle),math.sin(angle)]];bound=.5*sum(map(abs,vel))+.08+4*.04;assert bound<1
 own=r.random();strength=r.random();tau=r.random()*math.log(50);fraction=r.random()*bound;P=[own*strength,own];C=[own*strength*tau/4,own*strength];assert P[0]*(1-fraction)>=0 and C[0]<=C[1] and P[0]<=P[1]
Y,X=np.indices((16,16));rng=np.random.default_rng(444);grain=.85+.3*rng.random((16,16));tests=[]
for shape in ['gaussian','grain-gaussian']:
 init=.6*np.exp(-((X-7.5)**2+(Y-7.5)**2)/18)*(grain if shape.startswith('grain')else 1)
 for gamma in [0,.025,.04]:
  m=init.copy()
  for t in range(20):
   delta=np.zeros_like(m)
   for axis,sign in [(0,1),(0,-1),(1,1),(1,-1)]:
    n=np.roll(m,-sign,axis);mix=.02*np.maximum(m-n,0)/np.maximum(m,5e-5);agg=gamma*np.clip((n-m)/np.maximum(m,5e-5),0,1);f=(.5 if axis==1 and sign==1 else 0)+mix+agg;f=np.minimum(f,np.maximum(1-n,0)/np.maximum(4*m,5e-5));transfer=m*f;delta-=transfer;delta+=np.roll(transfer,sign,axis)
   m+=delta;assert m.min()>-1e-12 and m.max()<=1+1e-12
  tests.append({'shape':shape,'gamma':gamma,'massError':float(m.sum()-init.sum()),'peak':float(m.max()),'variance':float(m.var()),'checkerMean':float(abs((m*((-1.)**(X+Y))).mean())),'min':float(m.min()),'max':float(m.max())})
out={'randomSamples':100000,'worstGammaOutflowBound':.5*(math.sqrt(2)+2/255)+.08+.16,'zeroDonorCannotCreateMass':True,'coneSharedFractionPreserved':True,'toy':tests,'toyScope':'16x16periodic20steps,unitrightflow/contact1, room4donor, doublefloat notRGBA8','noGPU':True};(d/'properties.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
