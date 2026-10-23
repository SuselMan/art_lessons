from pathlib import Path
import json,copy
r=Path(__file__).parent;parent=json.load(open(r.parent/'brush-distance-calibration/production-physical22-occupancy-adv-substeps-integer.json'))
before='\t\tlet dry = null;'
for sweeps in [1,2,4]:
 s=dict(id='production-physical22-occupancy-int-postrelax'+str(sweeps),parent='baseline',baseEngine='7ca4cf5d',runtimePatches=copy.deepcopy(parent['runtimePatches']),status='UNRENDERED root review required',researchParentId=parent['id'],scope='exact9/3 singlepaint recorded drypaper only; merge0/S1 orS2 remains existing',mechanism='After all mechanical contact pairedcopybacks, before groupTide: extra radius1 axes/diagonal ordinary diffusion sweeps using existing free pressure/band. Colour first and pigment second both read unchanged pre-step physical guide; both copiedback only aftertwo outputs.',control='Compare SAMEoccupancyinteger parent no-relax vs1/2/4relax sweeps. Not physical22 source/optics comparison.',limits=['No new texture; pressure/band alias assertions hard','Existing density-normalized diffuse coefficient/headroom decoder retained','Only coverage freewater gate; no domepressure because scratchpressure nowfree','No additional fieldrect/source/operation changes; transient blur may erase sourcevariation further','Integer brush conservation does not imply later floatRGBA8 diffusion exactcode conservation'])
 after=f"""        if (scratch.paints.size !== 1 || merge !== 0 || (S !== 1 && S !== 2)) throw Error('Postrelax scope singlepaint merge0');
        if (dep.out===field.pressure || dep.out===field.band || col.out===field.pressure || col.out===field.band || dep.out===col.out)throw Error('Postrelax framebuffer/source alias');
        for(let sweep=0;sweep<{sweeps};sweep++)ops.push(()=>{{
          const started=performance.now();
          this.ctx.passes().diffuseStep(field,x0,y0,S,paperTexW,paperTexH,col.out,field.band,1,false,field.coverage,dep.out);
          this.ctx.passes().diffuseStep(field,x0,y0,S,paperTexW,paperTexH,dep.out,field.pressure,1,false,field.coverage,dep.out);
          field.band.copyRegionInto(col.out,0,field.h-h/S,0,field.h-h/S,w/S,h/S);
          field.pressure.copyRegionInto(dep.out,0,field.h-h/S,0,field.h-h/S,w/S,h/S);
          gl.finish();if(performance.now()-started>1000)throw Error('Postrelax sweep over1s');
          globalThis.__wcPostRelax=(globalThis.__wcPostRelax??0)+1;
        }});
"""+before
 s['runtimePatches'].append(dict(kind='vite-module-exact',module='/src/engine/src/raster/WatercolorSettlePlan.ts',countPerResponse=1,before=before,after=after));(r/(s['id']+'.json')).write_text(json.dumps(s,indent=2))
