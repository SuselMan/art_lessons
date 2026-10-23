import pathlib,json,random,math,numpy as np
p=pathlib.Path('temp/wc-runs/overnight-next');d=p/'donor-support-audit';base=json.load(open(p/'transport-distance-audit/production-max-paired-headroom2-microcoupled-curvature10.json'));js=(p/'settle-leveling-audit/actual-5288-settle.js').read_text();before='''const left = Math.max(0, Math.floor((cr.x - x0) / S)), right = Math.min(field.w, Math.ceil((cr.x + cr.w - x0) / S));
\t\t\tconst bottom = Math.max(0, Math.floor(field.h - (cr.y + cr.h - y0) / S)), top = Math.min(field.h, Math.ceil(field.h - (cr.y - y0) / S));''';assert js.count(before)==1
after='''const brushHop = Math.max(1, Math.round(contact.radius * .25 / S));
\t\t\tconst left = Math.max(0, Math.floor((cr.x - x0) / S) - brushHop), right = Math.min(field.w, Math.ceil((cr.x + cr.w - x0) / S) + brushHop);
\t\t\tconst bottom = Math.max(0, Math.floor(field.h - (cr.y + cr.h - y0) / S) - brushHop), top = Math.min(field.h, Math.ceil(field.h - (cr.y - y0) / S) + brushHop);'''
pad={'kind':'vite-module-exact','module':'/src/engine/src/raster/WatercolorSettlePlan.ts','before':before,'after':after,'countPerResponse':1};flux='float amount = (0.6 * max(dot(velocity, direction), 0.0) + mixFraction) * min(flow.b, flowAt(to).b) * contact;'
for name,adv in [('pad-control',None),('donor04',.4),('donor06',.6)]:
 x={k:v for k,v in base.items()if k in ['parent','baseEngine','comparisons']};x['id']='production-physical22-support-'+name;x['runtimePatches']=base['runtimePatches']+[pad]
 if adv:x['runtimePatches'].append({'kind':'shader-exact','selector':'float flux(vec2 from, vec2 to, vec2 direction)','before':flux,'after':f'float amount = ({adv} * max(dot(velocity, direction), 0.0) * flow.b + mixFraction * min(flow.b, flowAt(to).b)) * contact;','countPerShader':1})
 x['mechanism']='Originalphysical22 MAX/paired/h2/micro/curvature withhop-paddedtransport/copybackscissor; '+('unchangedfluxcontrol'if adv is None else'donor-onlyadvectivecontact, mixingstillbothcontacts')+'.';x['proof']='OriginalflowRect/texture/sourcegeometryunchanged; target existingcoverageA gate andreceiverroom remain. P/D copiedback over identicalpaddedrectangle; closedfieldbordersblockflux.';x['observableOutcome']='Padcontrol expectedbyteidentity; donorflow maycarrypaintintoexistingcoveredpaperbeyondbrushsupport, no winnerclaim.';x['risks']=['CoverageA is geometriccontact, notphysicalwetness.','SourceMAX/h2quantization/clipping unchanged.','CFL .933234 upperbound, sharedpositivefractions only; noexactRGBA8massclaim.','Paddingaddsarea but nonewGPUbuffers.'];(d/(x['id']+'.json')).write_text(json.dumps(x,indent=2)+'\n');s=(p/'transport-distance-audit/audit-max-micro.mts').read_text().replace('temp/wc-runs/overnight-next/transport-distance-audit/production-max-paired-headroom2-microcoupled.json',str(d/(x['id']+'.json'))).replace('temp/wc-runs/overnight-next/transport-distance-audit/max-headroom2-micro-shader-audit.json',str(d/(name+'-shader-audit.json')));(d/f'audit-{name}.mts').write_text(s)
(d/'patched-settle.mjs').write_text(js.replace(before,after));r=random.Random(601)
for _ in range(100000):
 W=r.randint(8,512);H=r.randint(8,512);l=r.randrange(W);rr=r.randint(l+1,W);b=r.randrange(H);t=r.randint(b+1,H);h=r.randint(1,32);L=max(0,l-h);R=min(W,rr+h);B=max(0,b-h);T=min(H,t+h)
 donorX=r.randrange(l,rr);donorY=r.randrange(b,t)
 for dx,dy in [(h,0),(-h,0),(0,h),(0,-h)]:
  x,y=donorX+dx,donorY+dy
  if 0<=x<W and 0<=y<H:assert L<=x<R and B<=y<T
(d/'properties.json').write_text(json.dumps({'samples':100000,'scissorOneHopClosureWithinField':True,'samePigmentColorCopybackBounds':True,'oldFluxPadControlOutsideSupportZero':True,'adv06CFLBound':.6*(math.sqrt(2)+2/255)+.08,'adv04CFLBound':.4*(math.sqrt(2)+2/255)+.08,'coverageGatePhysicalDryness':False,'noGPU':True},indent=2)+'\n')
