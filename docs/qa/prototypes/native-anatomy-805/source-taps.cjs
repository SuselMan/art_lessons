'use strict';
// Applied ONLY to the independently bundled QA source fork, never served engine files.
const KEY='__qaNativeAnatomy805';
function one(s,a,b){if(s.split(a).length!==2)throw Error('Native anatomy source drift: '+a.slice(0,90));return s.replace(a,b)}
function tap(stage,outputs,detail='{}'){return `;(globalThis as unknown as {${KEY}?: (event:unknown)=>void}).${KEY}?.({stage:${stage},outputs:${outputs},detail:${detail}});`}
function transformNativeAnatomy(path,source){if(source.includes(KEY))throw Error('Native anatomy source drift: already instrumented');const name=path.replaceAll('\\','/').split('/').pop();let s=source;
 if(name==='ContrastPhase.ts'){
  s=one(s,'end(background);const t=',`end(background);${tap("'contrast.background'",'{background}', '{strideWorld:24}')}const t=`);
  s=one(s,'end(out)};',`end(out)${tap("optical===2?'contrast.selection':optical===0?'contrast.referenceP':'contrast.referenceC'",'{out}', '{optical}') }};`);
  s=one(s,'regionKeep.writePixels(keep);',`regionKeep.writePixels(keep);${tap("'contrast.retainedComponents'",'{regionKeep}', '{nx,ny,minCells}')}`);
 }else if(name==='BackgroundMix.ts'){
  s=one(s,'gl.drawArrays(gl.TRIANGLES,0,6);out.endDraw();',`gl.drawArrays(gl.TRIANGLES,0,6);out.endDraw();${tap("program===eligibility?'background.eligibility':program===copy?'background.copy':program===smooth?'background.smooth':'background.reconstruct'",'{out}', '{inputs:textures}')}`);
 }else if(name==='WatercolorSettlePlan.ts'){
  const a='this.ctx.passes().fieldOp(out, a, b, mode, k, approvedM70 ? { ...opts, discreteGrid: true } : opts)';
  s=one(s,a,a+tap("'fieldOp'",'{out}', '{mode,k,opts,inputs:{a,b,c:opts?.c,d:opts?.d,e:opts?.e}}'));
  const f='this.ctx.passes().waterFrontStep(field, x0, y0, dryCost, src, dst, max, climb, floor, stride, S, foreignTexture, approvedM70)';
  s=one(s,f,'{'+f+tap("'front.complete'",'{dst}', '{max,climb,floor,stride,scale:S,inputs:{src,coverage:field.coverage}}')+'}');
  const d='this.ctx.passes().diffuseStep(field, x0, y0, S, paperTexW, paperTexH, src, dst, radius, knight, gate, density, solvent, approvedM70)';
  s=one(s,d,d+tap("'diffuse'",'{dst}', '{radius,knight,inputs:{src,gate,density,solvent}}'));
  s=one(s,'for (const capture of captureInputs) capture()',`for (const capture of captureInputs) capture();${tap("'stitch.complete'",'{a:field.a,b:field.b,coverage:field.coverage,ca:field.ca,cb:field.cb,solvent}', '{scale:S,x0,y0}')}`);
  s=one(s,'if (last && pp.src !== home) materialFieldOp(home, pp.src, pp.src, 1, 0)', 'if (last && pp.src !== home) materialFieldOp(home, pp.src, pp.src, 1, 0);if(last){'+tap("home===field.pressure?'front.outwardComplete':climb===0?'front.inwardFlatComplete':'front.inwardComplete'",'{home}', '{max,climb,floor,budgetPx,scale:S}')+'}');
  s=one(s,'if (gs !== field.mask) materialFieldOp(field.mask, gs, gs, 1, 0)', 'if (gs !== field.mask) materialFieldOp(field.mask, gs, gs, 1, 0)'+tap("'front.rimPrepared'",'{pressure:field.pressure,coverage:field.coverage,band:field.band,normalizer:field.mask}', '{}'));
  s=one(s,'present(last.dst, b, last.cdst, colour?.b)', 'present(last.dst, b, last.cdst, colour?.b)'+tap("i+n===carry.length?'carry.complete':'carry.chunk'",'{mobileP:last.dst,mobileC:last.cdst,fixedP:b,fixedC:colour?.b}', '{}'));
  s=one(s,'// The pressure gate is no longer sampled after the diffusion.',tap("'diffusion.complete'",'{mobileP:st.src,mobileC:paired?.src,fixedP:b,fixedC:colour?.b}', '{}')+'// The pressure gate is no longer sampled after the diffusion.');
  s=one(s,'        land()','        land()'+tap("'land.complete'",'{p:[...scratch.tileEntries()][0]?.[1].inkDry??[...scratch.tileEntries()][0]?.[1].inkLoad,c:[...scratch.tileEntries()][0]?.[1].colorDry??[...scratch.tileEntries()][0]?.[1].inkColor}', '{entries:[...scratch.tileEntries()]}'));
 }else if(name==='WatercolorFrontPaths.ts'){
  s=one(s,'common(program, u, args); setup(); gl.drawArrays(gl.TRIANGLES, 0, 6);',`common(program, u, args); setup(); gl.drawArrays(gl.TRIANGLES, 0, 6);${tap("program===build?'front.prefixBuild':'front.prefixJump'",'{dst}', '{args}')}`);
 }else if(name==='PuddleTarget.ts'){
  s=one(s,'aligned.copyTo(entry.inkLoad!)',`aligned.copyTo(entry.inkLoad!)${tap("'align.rawP'",'{p:entry.inkLoad,c:entry.inkColor}', '{}')}`);
  s=one(s,'contour.copyTo(out.coverage)\n    state.revision++',`contour.copyTo(out.coverage)${tap("'publish'",'{p:out.p,c:out.c,coverage:out.coverage}', '{epoch:state.epoch,revision:state.revision}') }\n    state.revision++`);
  s=one(s,'temp.copyTo(dst)}finally',`temp.copyTo(dst)${tap("'dryGuard'",'{dst}', '{inputs:{raw,water:initialWater}}')}}finally`);
  s=one(s,'dryCoverage!.copyTo(out.coverage)',`dryCoverage!.copyTo(out.coverage)${tap("'dry.coverage'",'{coverage:out.coverage}', '{}')}`);
 }else return source;
 return s;
}
module.exports={transformNativeAnatomy,KEY};
