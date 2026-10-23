import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';
const file='temp/pure-water-plan/causal-trace/observer.js',text=fs.readFileSync(file,'utf8');new Function('return '+text);
let clock=0;const marks=[];const install=vm.runInNewContext(text,{performance:{now:()=>++clock,mark:n=>marks.push(n),measure:()=>{}},Error});
const effects=[],passes={};for(const n of ['fieldOp','waterFrontStep','wcResample','diffuseStep','brushPass','pigmentColor','costDomainStep'])passes[n]=function(...a){effects.push([n,this,...a]);return a[0]};
const scratch={pigmentInputsKnownZero:true},op1=()=>passes.waterFrontStep('V','cost'),op2=()=>passes.fieldOp('out','a','b',1,1),ops=[op1,op2],finish=()=>passes.wcResample('target');
const planResult={ops,finish},p={diagnosticPureWaterPlan:true,prepare(){return planResult}};
const q={current:null,start(scratch,ops,finish){this.current={scratch,ops,complete:finish,next:0};ops[0]();this.current.next=1},advance(){const s=this.current;s.ops[s.next++]();if(s.next===s.ops.length){this.current=null;s.complete()}},complete(){const s=this.current;this.current=null;if(s){for(;s.next<s.ops.length;s.next++)s.ops[s.next]();s.complete()}}};
const generator=(function*(){effects.push('executed');yield 1;return 2})(),painter={paint(){return generator},ctx:{drawRibbonBands(...a){effects.push(['bands',...a]);return a[0]}}};
const E={_settleQueue:q,_settlePlan:p,_watercolorPasses:passes,_ribbonPainter:painter};const originals=[q.start,q.advance,q.complete,p.prepare,painter.paint,passes.fieldOp];
const observer=install(E);const out=p.prepare(scratch,[],{},0,0,1,0,1,0,0,undefined,true,undefined,false);assert.equal(out,planResult);assert.equal(out.ops,ops);assert.equal(out.ops[0],op1);assert.equal(out.finish,finish);assert.equal(painter.paint(),generator);assert(!effects.includes('executed'));
q.start(scratch,ops,finish);q.advance();assert.equal(effects.length,3);assert.equal(effects[0][0],'waterFrontStep');assert.equal(effects[1][0],'fieldOp');assert.equal(effects[2][0],'wcResample');assert.equal(effects[1][1],passes);assert.deepEqual(effects[1].slice(2),['out','a','b',1,1]);
const r=observer.stop();assert(!r.overflow);for(const [i,f]of [q.start,q.advance,q.complete,p.prepare,painter.paint,passes.fieldOp].entries())assert.equal(f,originals[i]);assert(r.records.some(x=>x.name==='waterFrontStep'&&x.index===0));assert(r.records.some(x=>x.name==='fieldOp.mode1'&&x.index===1));assert(r.records.some(x=>x.name==='wcResample'&&x.phase==='finish/land/source-rebase'));
// Synchronous drain updates the actual saved job cursor, even after queue clears it.
const b=install(E);q.start(scratch,ops,finish);q.complete();const br=b.stop();assert(br.records.some(x=>x.name==='fieldOp.mode1'&&x.phase==='complete'&&x.index===1));assert(br.records.some(x=>x.name==='wcResample'&&x.phase==='finish/land/source-rebase'));
// Exceptions propagate unchanged; observers never retry a physical operator.
const error=new Error('same instance');passes.brushPass=()=>{throw error};const c=install(E);assert.throws(()=>passes.brushPass(1),x=>x===error);c.stop();
console.log(JSON.stringify({syntax:true,identity:true,argumentOrder:true,sameReceiver:true,sameGeneratorNoConsumption:true,commandOrder:true,syncDrainCursor:true,exceptionIdentity:true,restore:true,source:file}));

const capped=install(E,{limit:0});const before=performance.getEntriesByType('mark').length;passes.fieldOp('x','y','z',20);assert.equal(performance.getEntriesByType('mark').length,before);assert(capped.stop().overflow);console.log(JSON.stringify({markCeiling:true,physicalOperatorStillCalled:true}));
