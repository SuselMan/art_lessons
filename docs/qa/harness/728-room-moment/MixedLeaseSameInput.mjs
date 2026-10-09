import{withControlledInputClock}from'./ControlledInputClock.mjs';
import{driveMixedLeaseInput,mixedLeaseInput,normalizedMixedHistory}from'./MixedLeaseInput.mjs';
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
const digest=value=>hash(new TextEncoder().encode(JSON.stringify(value)));
/** Controlled MODEL clocks separate from hardware wall time. Never a pen latency benchmark. */
export async function runMixedLeaseSameInput({engineUrl,enabled}){
 if(typeof enabled!=='boolean')throw Error('Explicit OFF/ON required');
 const{PencilEngine}=await import(engineUrl),canvas=document.createElement('canvas');canvas.width=canvas.height=128;document.getElementById('surface').replaceChildren(canvas);
 window.__mixedLeasePartial={enabled,phase:'engine-init'};
 const e=new PencilEngine(canvas,{paper:'fine',pageWidth:128,pageHeight:128,userId:'mixed-input-actor',gradientFibres:true});
 let originalStart;const scratches=new Set(),now=performance.now.bind(performance);
 try{
  await e.paperReady();e.appendOperation({id:'mixed-layer',type:'layer_add',userId:'mixed-input-actor',layerId:'L',timestamp:1791490000000,name:'QA'},'remote');e.setActiveLayer('L');e.setCompositeOrder([{id:'L',opacity:1}]);e.setLocked(false);
  e._wcJoinedTouch=true;e._wcJoinedTouchMixed=false;e._wcJoinedFinishDeferred=false;
  // Fail if the source silently opts into other experimental material paths.
  if(e._wcAsyncFinish||e._wcMaterialPresentation||e._wcNative||e._settlePlan.splitQuanta)throw Error('Unexpected experimental model');
  originalStart=e._settleQueue.start;e._settleQueue.start=function(s,...args){scratches.add(s);return originalStart.call(this,s,...args)};
  const wallStart=now(),controlled=withControlledInputClock(e,({clock,timeOrigin})=>driveMixedLeaseInput(e,{enabled,clock,timeOrigin})),proof=controlled.result,inputWallMs=now()-wallStart;window.__mixedLeasePartial={enabled,phase:'input-complete',proof,inputWallMs};
  // Queue drains and frame scheduling always see real performance clock.
  e._completeSettle();const beforeFrame=performance.now();await new Promise(requestAnimationFrame);const afterFrame=performance.now();if(!(afterFrame>beforeFrame)||controlled.realBudgetCalls<1)throw Error('Real scheduler clock proof failed');
  const end=now()+60000;while(e._settle||e._wcCanonical.pending||e._rebuildJobs.size||e._unsettledLayers.size){if(now()>end)throw Error('Canonical idle deadline');await new Promise(requestAnimationFrame)}
  if(e._fieldReleaseTimer){clearTimeout(e._fieldReleaseTimer);e._fieldReleaseTimer=0}
  const ops=structuredClone(e.getOperations().filter(o=>o.type==='stroke'));Object.assign(window.__mixedLeasePartial,{phase:'canonical-idle',rawHistory:ops});if(ops.length!==2||ops.some(o=>!o.dabsPacked)||!ops[1].wet||/^0+$/.test(ops[1].wet))throw Error('Two genuine packed author operations required');
  const fields=[];Object.assign(window.__mixedLeasePartial,{phase:'field-readback',fields,scratchCount:scratches.size,fieldCacheCount:e._fieldCache.length});const inspect=async(label,b)=>{if(!b){fields.push({label,absent:true});return}const bytes=b.readPixels();if(bytes.length!==b.width*b.height*4)throw Error('Field byte contract');fields.push({label,width:b.width,height:b.height,bytes:bytes.length,nonzero:bytes.reduce((n,v)=>n+(v!==0),0),sha:await hash(bytes)})};
  if(scratches.size!==1)throw Error('Expected one joined scratch');const scratch=[...scratches][0],entries=[...scratch.tileEntries()];if(entries.length!==1||e._fieldCache.length!==1)throw Error('Expected one tile/field');
  for(const key of ['original','coverage','inkLoad','inkColor','inkDry','colorDry','solventLoad','solventBase','inkBase','colorBase','strokeInk','strokeColor','inkSettled','colorSettled'])await inspect('scratch:'+key,entries[0][1][key]);
  for(const key of ['a','b','c','ca','cb','cc','coverage','mask','pressure','band'])await inspect('field:'+key,e._fieldCache[0][key]);
  const tiles=[...e._layers.get('L').allResident()];if(tiles.length!==1)throw Error('Expected one material tile');await inspect('material',tiles[0].buffer);
  if(fields.length!==25||!fields.some(f=>f.label==='scratch:inkLoad'&&f.nonzero>0)||!fields.some(f=>f.label==='scratch:coverage'&&f.nonzero>0))throw Error('Meaningful 25-role fields required');
  const blob=await e.exportPNG(true);if(!blob)throw Error('Export missing');const image=await createImageBitmap(blob),output=document.createElement('canvas');output.width=image.width;output.height=image.height;const ctx=output.getContext('2d');ctx.drawImage(image,0,0);image.close();const rgba=ctx.getImageData(0,0,output.width,output.height).data;let alphaNonzero=0;for(let i=3;i<rgba.length;i+=4)alphaNonzero+=rgba[i]!==0;if(!alphaNonzero)throw Error('Empty export');const whole={width:output.width,height:output.height,sha:await hash(rgba),alphaNonzero};output.width=output.height=0;
  const semanticHistory=normalizedMixedHistory(ops);Object.assign(window.__mixedLeasePartial,{phase:'complete',whole,semanticHistory,clockProof:{realBudgetCalls:controlled.realBudgetCalls,frameClockAdvance:afterFrame-beforeFrame}});
  return{enabled,proof,inputSHA:await digest(proof.effectiveInputs),sourceInputs:proof.sourceInputs,sourceInputsSHA:await digest(proof.sourceInputs),semanticHistory,semanticHistorySHA:await digest(semanticHistory),rawHistory:ops,fields,whole,glError:e.gl.getError(),lost:e.gl.isContextLost(),inputWallMs,clockProof:{realBudgetCalls:controlled.realBudgetCalls,frameClockAdvance:afterFrame-beforeFrame},scope:'Controlled model-clock overlapping real pointer pipeline. ID bijection only; wet and packed dabs exact. Wall timing is diagnostic, not natural continuous pen experience.'};
 }finally{if(originalStart)e._settleQueue.start=originalStart;e.destroy()}
}
export function compareMixedLeaseArms(a,b){return !!(a&&b&&!a.enabled&&b.enabled&&a.proof.predecessorPending&&b.proof.predecessorPending&&a.proof.downDrains>0&&a.proof.leaseAdmissions===0&&b.proof.downDrains===0&&b.proof.leaseAdmissions===1&&b.proof.sourceCommands>0&&a.clockProof.realBudgetCalls>0&&b.clockProof.realBudgetCalls>0&&a.clockProof.frameClockAdvance>0&&b.clockProof.frameClockAdvance>0&&a.sourceInputs?.length>0&&b.sourceInputs?.length>0&&a.sourceInputsSHA===b.sourceInputsSHA&&JSON.stringify(a.sourceInputs)===JSON.stringify(b.sourceInputs)&&a.rawHistory.map(o=>o.strokeId).join(',')==='QAwater001,QApigmt002'&&b.rawHistory.map(o=>o.strokeId).join(',')==='QAwater001,QApigmt002'&&a.inputSHA===b.inputSHA&&a.semanticHistorySHA===b.semanticHistorySHA&&JSON.stringify(a.semanticHistory)===JSON.stringify(b.semanticHistory)&&a.fields.length===25&&b.fields.length===25&&JSON.stringify(a.fields)===JSON.stringify(b.fields)&&JSON.stringify(a.whole)===JSON.stringify(b.whole)&&!a.glError&&!b.glError&&!a.lost&&!b.lost)}
/** Compact fail localization only; never relaxes the equality gate. */
export function mixedLeaseDifferences(a,b){
 if(!a||!b)return{incompleteArms:true};const left=new Map(a.fields.map(f=>[f.label,f])),right=new Map(b.fields.map(f=>[f.label,f]));
 return{admissions:[a.proof,b.proof].map(p=>({pending:p.predecessorPending,leases:p.leaseAdmissions,downDrains:p.downDrains,upDrains:p.upDrains,sourceCommands:p.sourceCommands})),inputEqual:a.sourceInputs?.length>0&&b.sourceInputs?.length>0&&a.sourceInputsSHA===b.sourceInputsSHA&&JSON.stringify(a.sourceInputs)===JSON.stringify(b.sourceInputs)&&a.rawHistory.map(o=>o.strokeId).join(',')==='QAwater001,QApigmt002'&&b.rawHistory.map(o=>o.strokeId).join(',')==='QAwater001,QApigmt002'&&a.inputSHA===b.inputSHA,semanticHistoryEqual:a.semanticHistorySHA===b.semanticHistorySHA,wetProfiles:[a.rawHistory,b.rawHistory].map(ops=>ops.map(o=>o.wet??'')),fieldMismatches:[...new Set([...left.keys(),...right.keys()])].filter(label=>JSON.stringify(left.get(label))!==JSON.stringify(right.get(label))),wholeEqual:JSON.stringify(a.whole)===JSON.stringify(b.whole),glErrors:[a.glError,b.glError],lost:[a.lost,b.lost]};
}
