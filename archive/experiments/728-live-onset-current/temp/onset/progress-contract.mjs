import assert from 'node:assert/strict';
// Executable design, not connected to the renderer. No physical-field oracle.
export class PartialProgressClock {
  constructor(limit, capturedAt, followTau=1400) {
    assert(Number.isInteger(limit)&&limit>=0&&Number.isFinite(capturedAt));
    this.limit=limit;this.progress=0;this.completed=0;this.at=capturedAt;this.followTau=followTau;
  }
  relaxed(strides) {
    assert(strides.every(s=>s===1)); // source currently canonical unit front
    this.progress+=strides.length;
  }
  take(cap) {
    assert(Number.isInteger(cap)&&cap>0);
    return Math.min(cap,Math.max(0,Math.min(this.progress,this.limit)-this.completed));
  }
  committed(steps) {
    assert(Number.isInteger(steps)&&steps>=0&&steps<=this.take(steps||1));
    this.completed+=steps;
  }
  published(now) {
    if(!Number.isFinite(now)||now<=this.at)return null;
    const tau=Math.min(this.followTau,now-this.at);this.at=now;
    return Object.freeze({at:now,step:this.completed,tau});
  }
}
const c=new PartialProgressClock(11,100);c.relaxed([1,1,1,1]);assert.equal(c.take(4),4);c.committed(4);
assert.deepEqual(c.published(200),{at:200,step:4,tau:100});assert.equal(c.published(200),null);assert.equal(c.published(199),null);assert.equal(c.published(NaN),null);
c.relaxed([1,1,1,1]);c.committed(c.take(4));assert.equal(c.completed,8);c.relaxed([1,1,1,1]);assert.equal(c.take(4),3);c.committed(3);assert.equal(c.completed,11);assert.equal(c.take(4),0);
assert.equal(c.published(5000).tau,1400);
// Quanta partition changes timing only; total allowed work must be identical.
for(const cap of [1,2,4,7]) { const p=new PartialProgressClock(31,0);for(let i=0;i<40;i++){p.relaxed([1]);while(p.take(cap))p.committed(p.take(cap));assert(p.completed<=Math.min(p.progress,31));}assert.equal(p.completed,31);}
assert.throws(()=>c.relaxed([2]));assert.throws(()=>c.committed(1));assert.throws(()=>c.take(0));
console.log('CPU contract PASS: actual unit progress, bounded monotonic cumulative work, partition totals, clock rejection, tau ceiling. No material mass/support claim.');
