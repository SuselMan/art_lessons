import json,copy,hashlib
from pathlib import Path
r=Path(__file__).parent
for p in r.glob('causal-current-max-*-r7.json'):
 s=json.load(open(p))
 for q in s['runtimePatches']:
  if q.get('module')=='/src/engine/index.ts' and q['before'].startswith('yield* this._ribbonStrokeWork'):
   q['after']=q['after'].replace('globalThis.__wcMaxContactHashes = [];','globalThis.__wcMaxContactHashes = []; globalThis.__wcMaxProof = {baseZeroChecks:0,lifecycleChecks:0,filmPairCopies:0,finalPlans:0,scope:"one blank single-pigment tile",copyByteIdentity:"NOT_MEASURED",groupBudget:"whole group including finish/gl.finish <=1000ms; no per-draw bound claim"};')
   q['after']=q['after'].replace('scratch.brushTravel = []; scratch.diffusePending = true;', '''globalThis.__wcMaxProof.beforeFinal = {gesture:scratch.gesture,brushTravel:scratch.brushTravel.length,waterUsed:scratch.waterUsed,pigmentUsed:scratch.pigmentUsed,lastKept:scratch.lastKept,standingCount:standingAll.size,contacts:globalThis.__wcMaxContacts.length}; scratch.brushTravel = []; scratch.diffusePending = true;''')
  if q.get('module')=='/src/engine/src/raster/WatercolorSettlePlan.ts' and q['before']=='const fieldOp = (':
   q['after']=q['after'].replace("throw Error('MAX lifecycle/paint guard');","throw Error('MAX lifecycle/paint guard'); globalThis.__wcMaxProof.lifecycleChecks++;")
   q['after']=q['after'].replace('for (const base of [own.inkBase, own.colorBase])','globalThis.__wcMaxProof.baseZeroChecks++; for (const base of [own.inkBase, own.colorBase])')
   q['after']=q['after'].replace('const entry = scratch.peek(tile.buffer);','const entry = scratch.peek(tile.buffer); globalThis.__wcMaxProof.filmPairCopies++;')
 template=next(q for q in s['runtimePatches']if q.get('module')=='/src/engine/src/raster/WatercolorSettlePlan.ts'); extra=copy.deepcopy(template)
 extra['before']='const contacts = brushDragContacts(scratch.brushTravel, {'
 extra['after']='''if (globalThis.__wcCausalBlankActive && !globalThis.__wcCausalFastInterim) {
      const own = scratch.peek(overlaps[0].tile.buffer);
      if (overlaps.length!==1 || scratch.paints.size>1 || own.filmGesture!==scratch.gesture || !own.inkBase || !own.colorBase || scratch.brushTravel.length!==0)throw Error('MAX final source/duplicate contact guard');
      for (const base of [own.inkBase,own.colorBase]){const raw=base.readPixels();for(const q of raw)if(q!==0)throw Error('MAX final base not zero');}
      globalThis.__wcMaxProof.finalPlans++; globalThis.__wcMaxProof.finalSourceGuardPassed=true;
    }
    const contacts = brushDragContacts(scratch.brushTravel, {'''
 extra['countPerResponse']=1;s['runtimePatches'].append(extra);p.write_text(json.dumps(s,indent=2))
a=json.load(open(r/'inputs.json'));a['cases']=[c for c in a['cases']if c['sheet']=='6'];(r/'inputs-six-only.json').write_text(json.dumps(a,indent=2))
f=r/'render.mjs';t=f.read_text().replace('maxMode:globalThis.__wcMaxMode,','maxProof:globalThis.__wcMaxProof, maxMode:globalThis.__wcMaxMode,');f.write_text(t)
(r/'manifest.json').write_text(json.dumps({p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in r.iterdir()if p.is_file()and p.name!='manifest.json'},indent=2))
