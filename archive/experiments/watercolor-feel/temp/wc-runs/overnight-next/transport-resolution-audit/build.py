import pathlib,json,numpy as np
p=pathlib.Path('temp/wc-runs/overnight-next');d=p/'transport-resolution-audit';base=json.load(open(p/'transport-distance-audit/production-max-paired-headroom2-microcoupled-curvature10.json'));js=(p/'settle-leveling-audit/actual-5288-settle.js').read_text();start=js.index('for (const contact of contacts) ops.push(() => {');end=js.index('\n\t\t// (§17.42)',start);before=js[start:end]
body=before[before.index('const cf ='):before.index('\n\t\t\tthis.ctx.passes().brushPass')];body=body.replace('const rect =','rect =').replace('const left =','left =').replace('right =','right =').replace('const bottom =','bottom =').replace('const scissor =','scissor =')
draw=before[before.index('this.ctx.passes().brushPass'):before.rindex('\n\t\t});')];draw=draw.replace('contact.radius, S','4 * S, S')
for name,split in [('substeps',True),('singlepixel-speed-control',False)]:
 count='hop'if split else'1';after='''for (const contact of contacts) {
            const hop = Math.max(1, Math.round(contact.radius * .25 / S));
            if (hop > 8) throw Error("Brush substep diagnostic hop exceeds8");
            let rect, scissor, left, right, bottom, top;
            ops.push(() => {
                if (!flowTexture) return;
                '''+body+'''
            });
            for (let sub = 0; sub < '''+count+'''; sub++) ops.push(() => {
                if (!flowTexture) return;
                '''+draw+'''
            });
        }''';x={k:v for k,v in base.items()if k in ['parent','baseEngine','comparisons']};x['id']='production-physical22-brush-resolution-'+name;x['runtimePatches']=base['runtimePatches']+[{'kind':'vite-module-exact','module':'/src/engine/src/raster/WatercolorSettlePlan.ts','before':before,'after':after,'countPerResponse':1}];x['mechanism']='Physical22 samecontacts/source/flow withsinglefieldtexel hop '+('repeatedstockhop counttimes'if split else'once speedcontrol')+'; pairedcopyback aftereachsubstep, distinctqueuedGPUunits.';x['proof']='brushPass radiusarg onlyhopparameter; passing4S makeshop1. SharedprestepPfractions forP/D, refreshafterbothdraws. Sameclosedminbothsupport/scissor, nonewbuffers. h≤8 runtimeguard. NotpurePDE equivalence: mixingdiffusivity/rounding/flowspatialvariation differs.';x['risks']=['Cost up to8pairedpasses percontact.','RGBA8 cumulative rounding may dominate.','NoTVD/exactintegerconservation claim.','Singlepixelcontrol intentionallyslower; compareit separately.','OriginalMAX/geometry/headroom2/clipping/curvatureunchanged.'];(d/(x['id']+'.json')).write_text(json.dumps(x,indent=2)+'\n');(d/(name+'-patched.mjs')).write_text(js.replace(before,after))
# 1D actualroom4donor andminbothfullcontact, periodiclargegrid
z=np.arange(512);initial=.2*np.exp(-.5*((z-128)/12)**2)
def run(h,n):
 m=initial.copy()
 for t in range(n):
  delta=np.zeros_like(m)
  for direction in [-1,1]:
   nei=np.roll(m,-direction*h);f=.02*np.maximum(m-nei,0)/np.maximum(m,5e-5)+(.6 if direction==1 else 0);f=np.minimum(f,np.maximum(1-nei,0)/np.maximum(4*m,5e-5));flux=m*f;delta-=flux;delta+=np.roll(flux,direction*h)
  m+=delta
 mass=m.sum();mean=(z*m).sum()/mass;return {'massError':float(mass-initial.sum()),'displacement':float(mean-128),'variance':float(((z-mean)**2*m).sum()/mass),'peak':float(m.max()),'min':float(m.min())}
out={'toy7pixelStockOnePass':run(7,1),'toySevenSinglePixelSubsteps':run(1,7),'toySinglePixelSpeedControl':run(1,1),'idealVarianceRatioSubstepOverCoarse':1/7,'scope':'Periodic1DGaussianheight.2, actualroom4donor/mix.02/fullflowBcontact1, floatnotRGBA8','noGPU':True};(d/'properties.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
