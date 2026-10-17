const test=require('node:test'),assert=require('node:assert/strict'),install=require('./phase-timing-installer.cjs');
test('method wrappers preserve receiver/getters/throw and restore without touching operations',async()=>{
 const oldFetch=global.fetch;global.fetch=async()=>({ok:false,status:418});try{await assert.rejects(install(),/418/);const t=global.__qa747Timing;
 let calls=0;const op=()=>{},obj={value:7,ops:[op],get guarded(){return this.value},work(x){calls++;return this.value+x},fail(){throw Error('original')}};
 const proxy=t.wrap(obj,'test',['work','fail']);assert.equal(proxy.guarded,7);assert.equal(proxy.work(3),10);assert.equal(calls,1);assert.equal(proxy.ops[0],op);assert.equal(proxy.work,proxy.work);assert.throws(()=>proxy.fail(),/original/);
 const prototype={work:obj.work},child=Object.assign(Object.create(prototype),{value:12});t.instrument(child,'work','inherited');assert.equal(child.work(1),13);t.restore();assert.equal(Object.hasOwn(child,'work'),false);assert.equal(child.work,prototype.work);
 const passes={fieldOp(a,b,c,mode){return mode},waterFrontStep(...args){return args[9]}};Object.setPrototypeOf(passes,{fieldOp:passes.fieldOp,waterFrontStep:passes.waterFrontStep});t.instrumentPasses(passes);assert.equal(passes.fieldOp(0,0,0,6),6);assert.equal(passes.waterFrontStep(...Array(9).fill(0),8),8);assert.ok(t.summary().rows['setup:passes.fieldOp:mode6']);assert.ok(t.summary().rows['setup:passes.waterFrontStep:stride8']);t.restore();
 }finally{global.fetch=oldFetch;delete global.__qa747Timing}
});
