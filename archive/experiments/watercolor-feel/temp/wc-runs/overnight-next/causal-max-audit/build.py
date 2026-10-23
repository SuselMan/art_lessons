import json,copy,hashlib
from pathlib import Path
r=Path(__file__).parent;old=json.load(open(r.parent/'chronology-audit/causal-fast-interleave-s6-sixteen-r6.json'));paired=json.load(open(r.parent/'record-headroom/production-paired-ribbon-source.json'))
loop=old['runtimePatches'][2]['after'];loop=loop.replace('globalThis.__wcCausalZeroControl = false;','',1).replace('const maxGroups = 16;','const maxGroups = globalThis.__wcMaxGroups;').replace('globalThis.__wcCausalTrace = [];','globalThis.__wcCausalTrace = []; globalThis.__wcMaxContacts = []; globalThis.__wcMaxContactHashes = [];')
loop=loop.replace('scratch.newFilm();','scratch.brushTravel = [];')
loop=loop.replace('this.gl.finish(); globalThis.__wcCausalTrace.push',"this.gl.finish(); if(performance.now()-groupStarted>1000)throw Error('MAX group exceeded1second'); globalThis.__wcCausalTrace.push")
loop=loop.replace('scratch.diffusePending = true;','''if (globalThis.__wcMaxMode === 'deferred') {
        scratch.diffusePending = true;
        globalThis.__wcMaxReplay = true; globalThis.__wcCausalFastInterim = true;
        try { this._finishRibbonStroke(scratch, false, false, false); if(this._settle)this._completeSettle(); this.gl.finish(); }
        finally { globalThis.__wcCausalFastInterim = false; globalThis.__wcMaxReplay = false; }
      }
      scratch.brushTravel = []; scratch.diffusePending = true;''')
fast=old['runtimePatches'][3]['after']
fast=fast.replace('if (!globalThis.__wcCausalBlankChecked) {','''const own = scratch.peek(overlaps[0].tile.buffer);
        if (scratch.paints.size > 1 || own.filmGesture !== scratch.gesture || !own.strokeInk || !own.strokeColor || !own.inkBase || !own.colorBase) throw Error('MAX lifecycle/paint guard');
        if (!globalThis.__wcCausalBlankChecked) {
          for (const base of [own.inkBase, own.colorBase]) { const raw = base.readPixels(); for (const q of raw) if(q!==0)throw Error('MAX base must be RGBA zero'); }''')
fast=fast.replace('for (const contact of contacts) ops.push(() => {','''const chosen = globalThis.__wcMaxReplay ? globalThis.__wcMaxContacts : contacts;
      if (!globalThis.__wcMaxReplay) {
        for(const c of contacts){ let h=2166136261; for(const q of c.field.pixels)h=Math.imul(h^q,16777619)>>>0; globalThis.__wcMaxContactHashes.push({rect:c.rect,radius:c.radius,hash:h});globalThis.__wcMaxContacts.push(c); }
      }
      ops.push(()=>{ if(chosen.length && !flowTexture){this._brushFlowTex??=gl.createTexture();flowTexture=this._brushFlowTex; gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,flowTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}});
      for (const contact of chosen) ops.push(() => {''')
fast=fast.replace('if (!flowTexture || globalThis.__wcCausalZeroControl) return;',"if (!flowTexture || (!globalThis.__wcMaxReplay && globalThis.__wcMaxMode !== 'interleaved')) return;")
fast=fast.replace('field.a.copyRegionInto(entry.inkLoad, sx, sy, tx, ty, ox1 - ox0, oy1 - oy0);','field.a.copyRegionInto(entry.inkLoad, sx, sy, tx, ty, ox1 - ox0, oy1 - oy0); field.a.copyRegionInto(entry.strokeInk, sx, sy, tx, ty, ox1 - ox0, oy1 - oy0);')
fast=fast.replace('if (entry.inkColor) field.ca.copyRegionInto(entry.inkColor, sx, sy, tx, ty, ox1 - ox0, oy1 - oy0);','if (entry.inkColor) field.ca.copyRegionInto(entry.inkColor, sx, sy, tx, ty, ox1 - ox0, oy1 - oy0); field.ca.copyRegionInto(entry.strokeColor, sx, sy, tx, ty, ox1 - ox0, oy1 - oy0);')
patches=[*paired['runtimePatches'],copy.deepcopy(old['runtimePatches'][2]),copy.deepcopy(old['runtimePatches'][3]),copy.deepcopy(old['runtimePatches'][6]),copy.deepcopy(old['runtimePatches'][7]),copy.deepcopy(old['runtimePatches'][8])]
patches[len(paired['runtimePatches'])]['after']=loop;patches[len(paired['runtimePatches'])+1]['after']=fast
# cleanup remains scoped through final full settle: no forced fixed-base clearing patches.
patches.pop(len(paired['runtimePatches'])+2)
def module(mod,before,after,count=1):return dict(kind='module',module=mod,before=before,after=after,expectedCount=count)
# use metadata/schema from known module patch
base=old['runtimePatches'][2]
def mp(mod,b,a,n=1):
 p=copy.deepcopy(base);p.update(module=mod,before=b,after=a,countPerResponse=n);return p
patches += [mp('/src/engine/index.ts','const settledGesture = scratch.gesture;','const settledGesture = scratch.gesture; const preserveMaxFilm = globalThis.__wcCausalFastInterim === true;'),mp('/src/engine/index.ts','scratch.releaseFilm(settledGesture);','if (!preserveMaxFilm) scratch.releaseFilm(settledGesture);',2),mp('/src/engine/src/raster/WatercolorSettlePlan.ts','const w = x1 - x0, h = y1 - y0;',"const w = x1 - x0, h = y1 - y0; if (globalThis.__wcCausalBlankActive && !globalThis.__wcCausalFastInterim && (S!==1 || w>1024 || h>1024)) throw Error('MAX final geometry budget');")]
for mode in ['zero','deferred','interleaved']:
 s=dict(id='causal-current-max-'+mode+'-r7',runtimePatches=copy.deepcopy(patches),parent='production paired-ribbon source only',status='UNRENDERED root review required',scope='one blank tile one pigment, normal MAX film retained',limitations=['MAX source replenishment is not mass conservation','RGBA8 mass1 clipping unchanged','same-group ZERO may differ from original one-shot geometry','DEFERRED same group contacts before final full settle; no duplicate brush'],contactProof='compare __wcMaxContactHashes across modes; per-group immutable contact byte hashes+rect+radius; final brushTravel empty',geometryAudit='geometry.json')
 s['runtimePatches'][len(paired['runtimePatches'])]['after']=f"globalThis.__wcMaxMode = '{mode}'; globalThis.__wcMaxGroups = 32;\n"+loop
 (r/(s['id']+'.json')).write_text(json.dumps(s,indent=2))
