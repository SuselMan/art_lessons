'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {topDown,renderPlane}=require('./render-snapshot.cjs');
const {png,referencePixels}=require('../../harness/805-algorithm-search/fixed-reference.cjs');
test('GL row flip retains every byte and diagnostic channel is not paint',()=>{const a=Buffer.from(Array.from({length:16},(_,i)=>i));assert.deepEqual([...topDown(a,2,2)],[8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7]);const r=renderPlane(a,2,2,{encoding:'channel',channel:3});assert.deepEqual([...r.pixels.subarray(0,4)],[11,11,11,255]);assert.throws(()=>renderPlane(a,2,2,{encoding:'invented'}))});
test('native optical preview exactly matches independent existing common renderer',()=>{const raw=Buffer.from([0,20,60,90,17,41,13,95,100,38,29,110,1,2,3,90]),scale=.6781914893617021,ratio={numerator:255,denominator:188},input=Buffer.alloc(24);const top=topDown(raw,2,2);for(let i=0;i<16;i++)input[i]=Math.min(255,Math.floor((top[i]*255+94)/188));input.fill(128,20);const expected=png(referencePixels(input,2,scale),2),actual=renderPlane(raw,2,2,{encoding:'native-c',scale,ratio});assert.deepEqual(actual.png,expected)});
