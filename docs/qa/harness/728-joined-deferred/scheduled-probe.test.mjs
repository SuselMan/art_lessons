import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const code=fs.readFileSync(new URL('./scheduled-probe.js',import.meta.url),'utf8');let time=0;
const install=vm.runInNewContext(code+';installJoinedScheduledProbe',{performance:{now:()=>++time},WeakMap});
const job={ops:[()=>{},()=>{}],next:0};let ticks=0,advances=0;
const q={current:job,tick(...args){assert.equal(this,q);assert.equal(args[0],true);ticks++;return this.advance('original')},advance(arg){assert.equal(this,q);assert.equal(arg,'original');advances++;this.current.next++;return 17}};
const e={_settleQueue:q,_opQueue:[],_wcJoinedDeferred:{}};const oldTick=q.tick,oldAdvance=q.advance,p=install(e);
assert.equal(q.tick(true),17);assert.equal(ticks,1);assert.equal(advances,1);const r=p.snapshot().rows[0];assert.equal(r.advance,1);assert.equal(r.ticks,1);assert.equal(r.continuations,1);assert.equal(r.heldTicks,1);assert.equal(r.backlogAtFirst,0);assert.equal(job.next,1);
p.restore();p.restore();assert.equal(q.tick,oldTick);assert.equal(q.advance,oldAdvance);
const failure={};q.advance=function(){throw failure};const probe=install(e);assert.throws(()=>q.advance(),x=>x===failure);probe.restore();console.log('PASS: same this/args/return/error, no operator consumption, scalar counters, restoration');
