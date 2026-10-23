// Read-only in-page instrumentation; immutable plain records, no GL readbacks.
() => {
 const E=window.__engine;window.__standingProof=[];let serial=0;
 const dabs=ds=>ds.map(d=>({x:d.x,y:d.y,size:d.size,angle:d.angle,aspectRatio:d.aspectRatio,t:d.t}));
 const ctx=s=>s?.finishContext?{landedWet:s.finishContext.landedWet,radiusPx:s.finishContext.radiusPx,bounds:s.finishContext.bounds?{...s.finishContext.bounds}:null,profile:{waterLevel:s.finishContext.profile?.waterLevel,normalizeDeposit:s.finishContext.profile?.normalizeDeposit},standing:s.finishContext.standing}:null;
 const original=E._ribbonDabsWork;
 E._ribbonDabsWork=function*(...a){const record={kind:'ribbon',serial:++serial,preset:a[3],strokeId:a[7]??this._strokeId,own:!!a[5],wet:a[9],dabs:dabs(a[1]),before:ctx(a[5])};window.__standingProof.push(record);const result=yield* original.apply(this,a);record.after=ctx(a[5]);record.foreignSources=a[5]?.foreignSources?.map(s=>({gesture:s.gesture,chunks:s.chunks?.map(c=>({id:c.id,preset:c.preset,wet:c.wet,seed:c.seed,dabs:dabs(c.dabs)})),footprints:s.footprints.map(f=>({...f}))}));record.seed=a[10]?[...a[10]]:null;record.resultStanding=result?[...result].map(([d,value])=>({x:d.x,y:d.y,size:d.size,value})):[];return result;};
 const strokeWork=E._ribbonStrokeWork;
 E._ribbonStrokeWork=function*(...a){window.__coveragePreset=a[3];window.__standingProof.push({kind:'materialProfile',serial:++serial,preset:a[3],profile:JSON.parse(JSON.stringify(a[4])),color:[...a[5]],wet:a[8],dabs:dabs(a[1]),prev:a[7]?dabs([a[7]])[0]:null,ctx:ctx(a[6])});return yield* strokeWork.apply(this,a)};
 const finish=E._finishRibbonStroke;
 E._finishRibbonStroke=function(...a){window.__standingProof.push({kind:'finish',serial:++serial,reveal:a[1],fade:a[2],spread:a[3],owned:!!a[4],ctx:ctx(a[0]),standing:[...a[0].standing].map(([d,value])=>({x:d.x,y:d.y,size:d.size,value}))});return finish.apply(this,a)};
 const wet=E._wetFromForeignStroke;
 E._wetFromForeignStroke=function(...a){window.__standingProof.push({kind:'paperWet',serial:++serial,layerId:a[0],preset:a[2],at:a[4],opId:a[6],dabs:dabs(a[3]),standing:a[5]?[...a[5]].map(([d,value])=>({x:d.x,y:d.y,size:d.size,value})):null});return wet.apply(this,a)};
 if(!window.__skipCoverageCommands){const painter=E._ribbonPainter.ctx;window.__coverageCommands=[];
 const nib=painter.drawRibbonNibPass;painter.drawRibbonNibPass=function(...a){if(a[5]===6)window.__coverageCommands.push({kind:'nib',preset:window.__coveragePreset,tile:[a[1].originX,a[1].originY],dab:dabs([a[2]])[0],opacity:a[6],own:a[7],inkWater:a[8],across:a[9]?[...a[9]]:null,paperWet:a[10],strength:a[11],seed:a[12]?[...a[12]]:null,puddle:a[17],poolBlot:a[18]});return nib.apply(this,a)};
 const bands=painter.drawRibbonBands;painter.drawRibbonBands=function(...a){if(a[3]==='coverage')window.__coverageCommands.push({kind:'bands',preset:window.__coveragePreset,tile:[a[1].originX,a[1].originY],vertices:Array.from(a[2]),aa:a[4],cloud:a[5],gran:a[6],seed:a[7]?[...a[7]]:null,water:a[8],retain:a[9],combs:a[10],bristleInk:a[11],poolBlot:a[13]});return bands.apply(this,a)};
 }
 return true;
}
