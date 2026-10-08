import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SealedPreviewGlPort } from './SealedPreviewGlPort.mjs'
const f=k=>({texture:{k},width:128,height:128})
test('existing material passes write only visual fields and retain world paper transform',()=>{
 const calls=[], passes={wcResample:(...a)=>calls.push(['reduce',a]),diffuseStep:(...a)=>calls.push(['diffuse',a])}
 const port=new SealedPreviewGlPort(passes,{world:{x:24,y:40,width:1024,height:1024},paperWidth:2048,paperHeight:2048})
 const source=Object.fromEntries(['pigmentLoad','colourLoad','solventLoad','coverage'].map(k=>[k,{texture:{k},width:1024,height:1024}]))
 const out={p:f('p'),c:f('c'),water:f('v'),coverage:f('cov')};port.initialize({source,out})
 assert.equal(calls.length,4);for(const [,a] of calls){assert.equal(a[8],8);assert.equal(a[9],0);assert.ok(!Object.values(source).includes(a[0]))}
 const ticket={p:out.p,c:out.c,outP:f('p1'),outC:f('c1'),water:out.water,coverage:out.coverage};port.step(ticket)
 const p=calls[4][1],c=calls[5][1];assert.deepEqual(p.slice(1,6),[24,40,8,2048,2048]);assert.equal(p[6],ticket.p);assert.equal(c[6],ticket.c);assert.equal(p[7],ticket.outP);assert.equal(c[7],ticket.outC);assert.deepEqual(p.slice(8),[8,false,ticket.coverage]);assert.deepEqual(c.slice(8),[8,false,ticket.coverage]);assert.equal(port.stats.pixels,6*128*128)
})
test('feedback rejected before issuing any GPU command',()=>{
 let count=0;const port=new SealedPreviewGlPort({diffuseStep:()=>count++},{paperWidth:2048,paperHeight:2048})
 const p=f('p');assert.throws(()=>port.step({p,c:f('c'),outP:p,outC:f('c1'),water:f('v'),coverage:f('cov')}));assert.equal(count,0)
})
