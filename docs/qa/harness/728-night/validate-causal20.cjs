// Independent assertions over saved native results and the final accepted API journal.
// No imports from the engine or its rejection/control fold implementation.
const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
const[reportPath,inputPath]=process.argv.slice(2);if(!reportPath||!inputPath)throw Error('report and accepted input paths required');
const report=JSON.parse(fs.readFileSync(reportPath)),operations=JSON.parse(fs.readFileSync(inputPath));
assert.equal(report.cycles.length,20);assert.ok([...operations].sort((a,b)=>a.seq-b.seq).every((x,i)=>x.seq===i+1),'Prefix counts require contiguous accepted seqs');assert.equal(new Set(operations.map(x=>x.id)).size,operations.length);assert.notEqual(report.authorA,report.authorB);
const stateAt=(id,seq)=>{let state='done';for(const x of [...operations].sort((a,b)=>a.seq-b.seq)){if(x.seq>seq)break;if(x.targetOpId!==id)continue;if(x.type==='operation_undo')state='undone';else if(x.type==='operation_redo')state='done';else if(x.type==='operation_revoke')state='gone'}return state};
let checks=0,erasers=0,rejoins=0;const groups={};
for(const cycle of report.cycles){
 assert.equal(cycle.pass,true);assert.equal(cycle.offline.closed,true);assert.equal(cycle.offline.held,false);assert.equal(cycle.offline.pending.length,1);
 const a=operations.find(x=>x.id===cycle.offline.pending[0].id),b=operations.find(x=>x.seq===cycle.acceptedOrder.B);assert.ok(a&&b);assert.equal(a.userId,report.authorA);assert.equal(b.userId,report.authorB);assert.equal(a.layerId,cycle.layer);assert.equal(a.type,'stroke');assert.equal(a.tool,'watercolor');
 assert.ok(cycle.order==='B-before-A'?b.seq<a.seq:a.seq<b.seq);
 if(cycle.action==='pigment'){assert.equal(b.type,'stroke');assert.equal(b.tool,'watercolor');assert.ok(Number(b.preset.split(':')[2])>0)}
 if(cycle.action==='layerDry'){assert.equal(b.type,'paper_dry');assert.equal(b.layerId,cycle.layer)}
 if(cycle.action==='globalDry'){assert.equal(b.type,'paper_dry');assert.equal(b.layerId,undefined)}
 if(cycle.action==='hide'){assert.equal(b.type,'layer_visibility');assert.equal(b.visible,false);assert.equal(b.layerId,cycle.layer)}
 if(cycle.action==='eraser'){assert.equal(b.type,'stroke');assert.equal(b.tool,'eraser');assert.ok(cycle.eraser.baseROIchanged>0);assert.equal(cycle.eraser.farDotChanged,0);assert.equal(cycle.eraser.wetAStillMaterial,true);assert.equal(cycle.eraser.pigmentInputsKnownZero,false);assert.equal(cycle.eraser.wetLoadNonzero,true);erasers++}
 for(const name of ['accepted-order','next-water','A-undo','A-redo'])assert.equal(cycle.checks.filter(x=>x.name===name).length,1);
 for(const check of cycle.checks){assert.deepEqual(check.state.unsettled,[]);assert.deepEqual(check.state.pending,[]);assert.equal(check.state.jobs,0);assert.equal(check.state.queue,0);assert.equal(check.state.pendingAcks,0);assert.equal(check.proof.changedChannels,0);assert.equal(check.proof.glError,0);assert.ok(check.proof.actualAlphaNonzero>0,'Distant dry dot requires a nonempty target');assert.equal(check.proof.originalLogRestored,true);checks++;if(check.name==='fresh-context-rejoin')rejoins++}
 const next=cycle.checks.find(x=>x.name==='next-water').proof,undo=cycle.checks.find(x=>x.name==='A-undo').proof,redo=cycle.checks.find(x=>x.name==='A-redo').proof;
 assert.notEqual(undo.actualHash,next.actualHash,'Undo must remove real A pigment');assert.equal(redo.actualHash,next.actualHash);assert.equal(stateAt(a.id,undo.fullAcceptedCount),'undone');assert.equal(stateAt(a.id,redo.fullAcceptedCount),'done');
 const controls=operations.filter(x=>x.targetOpId===a.id&&x.userId===report.authorA);assert.equal(controls.filter(x=>x.type==='operation_undo').length,1);assert.equal(controls.filter(x=>x.type==='operation_redo').length,1);
 const group=cycle.action+'/'+cycle.order;groups[group]=(groups[group]??0)+1;
}
assert.equal(checks,84);assert.equal(erasers,4);assert.equal(rejoins,4);assert.ok(Object.values(groups).every(n=>n===2));
const result={pass:true,source:report.source,cycles:20,exactChecks:checks,eraserCases:erasers,rejoins,groups,independentUndoStateAndChangedMaterial:true,inputOperations:operations.length,inputSHA256:crypto.createHash('sha256').update(fs.readFileSync(inputPath)).digest('hex')};
console.log(JSON.stringify(result,null,2));
