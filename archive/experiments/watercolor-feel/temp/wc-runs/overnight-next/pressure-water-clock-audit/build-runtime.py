import pathlib,json,subprocess
r=pathlib.Path('temp/wc-runs/overnight-next/pressure-water-clock-audit');patches=[]
def add(mod,b,a,count=1):patches.append(dict(kind='vite-module-exact',module='/src/engine/src/'+mod,before=b,after=a,countPerResponse=count))
paint='dabs/RibbonStrokePainter.ts';scratch='buffers/RibbonStrokeScratch.ts'
first=(r/'actual-5288-painter.js').read_text().splitlines()[0];add(paint,first,first+'\nimport { tipFootprint as __wcFootprint, createTipState as __wcTipState } from "/src/engine/src/dabs/tipFootprint.ts";\nimport { shapingForWatercolorPreset as __wcShaping } from "/src/engine/src/presets/watercolorPresets.ts";')
entry='\t*paint(target, dabs, preset, presetName, profile, color, scratch, prevDab, wetProfile, strokeSeed, deferComposite = false, pieceTris = 0) {'
init='''
    if(profile.waterDepletion && scratch._wcNominalCapacity == null) {
      scratch._wcNominalCapacity=0; // irreversible fallback for this gesture
      const first=dabs[0];
      if(!prevDab && first && first.pressure>0.05 && Number.isFinite(first.size) && first.size>0 && Number.isFinite(first.aspectRatio)) {
        const shape=__wcShaping(presetName);
        const forward=B=>__wcFootprint(shape,{x:first.x,y:first.y,pressure:first.pressure,tiltX:first.tiltX,tiltY:first.tiltY,baseSize:B,pathAngle:0,ds:0,speed:0,cameraAngle:0},__wcTipState());
        let lo=0.5,hi=1024;
        if(forward(lo).size<=first.size && forward(hi).size>=first.size) {
          for(let k=0;k<40;k++){const mid=(lo+hi)/2;if(forward(mid).size<first.size)lo=mid;else hi=mid;}
          const nominal=(lo+hi)/2,check=forward(nominal);
          if(Math.abs(check.size-first.size)<0.001 && Math.abs(check.aspectRatio-first.aspectRatio)<0.001 && forward(nominal+0.01).size-check.size>1e-6) {
            const full=__wcFootprint(shape,{x:0,y:0,pressure:1,tiltX:0,tiltY:0,baseSize:nominal,pathAngle:0,ds:0,speed:0,cameraAngle:0},null);
            const C=Math.pow(full.size*0.5*preset.sizeMultiplier,2)*Math.max(full.aspectRatio,1);
            if(Number.isFinite(C)&&C>=0.25&&C<=1048576)scratch._wcNominalCapacity=C;
          }
        }
      }
    }
'''
add(paint,entry,entry+init);add(paint,'used = watercolorWaterClock(used, step, wetHere);','used = watercolorWaterClock(used, step * (scratch._wcNominalCapacity > 0 ? minor * minor * Math.max(dab.aspectRatio, 1) / scratch._wcNominalCapacity : 1), wetHere);')
add(scratch,'\t_waterUsed = 0;','\t_wcNominalCapacity = null;\n\t_waterUsed = 0;');add(scratch,'\t\tthis._waterUsed = 0;','\t\tthis._wcNominalCapacity = null;\n\t\tthis._waterUsed = 0;',2);add(scratch,'waterUsed: this._waterUsed,','waterUsed: this._waterUsed, wcNominalCapacity: this._wcNominalCapacity,');add(scratch,'this._waterUsed = snap.waterUsed;','this._waterUsed = snap.waterUsed; this._wcNominalCapacity = snap.wcNominalCapacity ?? 0;')
for mod,name in [(paint,'painter'),(scratch,'scratch')]:
 text=(r/('actual-5288-'+name+'.js')).read_text()
 for p in patches:
  if p['module'].endswith(mod):assert text.count(p['before'])==p['countPerResponse'],(p['before'],text.count(p['before']));text=text.replace(p['before'],p['after'])
 out=r/('fullcontact-'+name+'-patched.mjs');out.write_text(text);subprocess.run(['node','--check',str(out)],check=True)
d=dict(id='production-fullcontact-firstdab-water-clock',parent='baseline',baseEngine='7ca4cf5d',runtimePatches=patches,observableOutcome='Conditional current-producer firstdab capacity retained acrosschunks; only water clock step area normalization changed, original pigment step unchanged.',risks=['Firstdab inverse conditional, no oldproducer version proof; matching obsolete geometry may be indistinguishable','Unknown/lowpressure/missingfirst falls back oldclock forwholegesture','Capacity not finitebrushmass theorem; sourcewater/hair/standing/diffusion indirectlychange','Geometry clamped/filtereddabs notusedforinverse; rawfirst required','No persisted op fields; scratch snapshots carrytemporary scalar'])
(r/(d['id']+'.json')).write_text(json.dumps(d,indent=2)+'\n');print(len(patches))
