import test from 'node:test';import assert from 'node:assert/strict';
import {PreviewSettlingBudget,addPairedSlice,PREVIEW_FIXED_PAIR_BYTES,PREVIEW_FIXED_THREE_OWNER_BYTES} from './PreviewSettlingBudget.mjs';
const make=()=>new PreviewSettlingBudget({durationMs:1300,smooth:[1,2].map(radius=>({radius,knight:false})),puddle:[3,4,5,6,7,8].map(radius=>({radius,knight:false})),fine:[9,10,11,12,13].map(radius=>({radius,knight:false})),core:.45,settleStep:.2});
test('finite production weights, paired positive moments and explicit ping-pong bytes',()=>{
 const b=make();b.tick(0);let outputs=[];for(let t=100;t<=1300;t+=100)outputs.push(b.tick(t));
 assert.equal(outputs.length,13);assert.equal(outputs[0].landWeight,0);assert.equal(outputs[1].landWeight,.45);
 assert.ok(Math.abs(b.mobile-.55*.8**6)<1e-15);assert.ok(Math.abs(b.fixed+b.mobile-1)<1e-15);assert.equal(b.tick(2000),null);
 let p=new Float64Array(4),c=new Float64Array(4);for(const o of outputs){const next=addPairedSlice(p,c,[1,2,3,4],[2,4,6,8],o.landWeight);p=next.p;c=next.c}
 for(let i=0;i<4;i++){assert.ok(p[i]>=0);assert.equal(c[i],2*p[i]);assert.ok(Math.abs(p[i]+b.mobile*(i+1)-(i+1))<1e-14)}
 assert.equal(PREVIEW_FIXED_PAIR_BYTES,1048576);assert.equal(PREVIEW_FIXED_THREE_OWNER_BYTES,3145728);
});
test('pause/freeze do not accumulate time, late tick admits one stage, loss retires',()=>{
 const b=make();b.tick(0);assert.equal(b.tick(500,{penActive:true}),null);assert.equal(b.tick(900,{frozen:true}),null);assert.equal(b.elapsed,0);
 assert.equal(b.tick(1000).index,0);assert.equal(b.tick(999),null);assert.equal(b.tick(10000).index,1);assert.equal(b.cursor,2);
 assert.equal(b.tick(10001,{lost:true}),null);assert.equal(b.tick(20000),null);
});
test('reject invalid budget and mismatched paired channels',()=>{
 assert.throws(()=>new PreviewSettlingBudget({durationMs:0,smooth:[],puddle:[],fine:[],core:.45,settleStep:.2}));
 assert.throws(()=>addPairedSlice([1],[1,2],[1],[1],.2));
});
test('noneligible owner timestamps advance while paused, switching latest cannot accrue old dt',()=>{const older=make(),younger=make();older.tick(0);younger.tick(0);for(const t of[500,1000,1500]){older.tick(t,{penActive:true});younger.tick(t)}assert.equal(older.elapsed,0);assert.equal(older.tick(1550),null);assert.equal(older.elapsed,50);assert.equal(older.tick(1600).index,0)});
