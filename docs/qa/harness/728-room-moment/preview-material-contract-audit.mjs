import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {SealedPreviewGlPort} from '/home/suselman/projects/pencil-agents/728-solvent-init/docs/qa/harness/728-gl-queue-batch/SealedPreviewGlPort.mjs';
const field=(name,rgba)=>({name,texture:{},width:128,height:128,rgba:[...rgba]});
const coverage=field('coverage',[128,64,230,255]), water=field('water',[255,0,0,255]);
const out={p:field('p',[0,0,0,0]),c:field('c',[0,0,0,0]),water,coverage};
const source={pigmentLoad:field('sourceP',[13,0,80,255]),colourLoad:field('sourceC',[20,10,5,80]),solventLoad:water,coverage:field('sourceCoverage',[128,64,230,255])};
// Separate solvent input: alias guard must stay meaningful.
source.solventLoad=field('sourceV',[255,0,0,255]);
const calls=[];
const port=new SealedPreviewGlPort({wcResample(dst,...args){dst.rgba=[...args[4].rgba]},diffuseStep(...args){calls.push(args)}},{paperWidth:1024,paperHeight:1024,domainFromWater:{draw(dst,v){dst.rgba=[0,0,0,v.rgba[3]>0?v.rgba[0]/v.rgba[3]*255:0]}}});
port.initialize({out,source});
assert.deepEqual(source.coverage.rgba,[128,64,230,255]);
assert.deepEqual(out.coverage.rgba,[0,0,0,255]);
const ink=source.pigmentLoad.rgba;
const wet=cv=>Math.max(ink[0]/ink[3],cv[2]/255);
assert(wet(out.coverage.rgba)<wet(source.coverage.rgba));
const across=cv=>cv[0]/cv[3]*2-1;
assert.equal(across(out.coverage.rgba),-1);
const ticket={p:out.p,c:out.c,outP:field('p1',[0,0,0,0]),outC:field('c1',[0,0,0,0]),water,coverage};
port.step(ticket);
assert.equal(calls.length,2);
assert.equal(calls[0][0].coverage,calls[1][0].coverage);
assert.deepEqual(calls[0].slice(1,6),calls[1].slice(1,6));
assert.equal(calls[0][6],ticket.p);assert.equal(calls[1][6],ticket.c);
// Shared linear transfer preserves spectral ratio in real arithmetic, not u8.
const fraction=.5,p=3,c=1;
assert.equal((c*fraction)/(p*fraction),c/p);
assert.notEqual(Math.round(c*fraction)/Math.round(p*fraction),c/p);
// Normalized UV mapping uses destination resolution: 128 and1024 cover same tile.
assert.equal(512/1024,64/128);
const runtime=await readFile('/home/suselman/projects/pencil-agents/728-solvent-init/docs/qa/harness/728-gl-queue-batch/OwnedPreviewRuntime.mjs','utf8');
assert(runtime.includes('f.original.copyTo(pending)'));
const oldRuntime=execFileSync('git',['show','6aeec405:docs/qa/harness/728-gl-queue-batch/OwnedPreviewRuntime.mjs'],{cwd:'/home/suselman/projects/pencil-agents/728-solvent-init',encoding:'utf8'});
assert(oldRuntime.includes('f.original,l.coverage,l[`p${side}`],l[`c${side}`]'));
assert(runtime.includes('f.original,f.coverage,l[`p${side}`],l[`c${side}`]'));
assert(!runtime.includes('f.original,l.coverage,l[`p${side}`],l[`c${side}`]'));
console.log(JSON.stringify({pass:true,coverageChannelsLost:true,standingBefore:wet(source.coverage.rgba),standingPreview:wet(out.coverage.rgba),pairedPasses:2,scope:'CPU contract; no GPU pixels or mass proof'}));
