import test from 'node:test';import assert from 'node:assert/strict';import{createPreviewFixedAccumulator}from'./PreviewFixedAccumulator.mjs';
test('paired draws read distinct OLD fields, no float ADD blend, reject alias before GPU writes',async()=>{
 const calls=[];const gl=new Proxy({isContextLost:()=>false,getAttribLocation:()=>0,getUniformLocation:(_,n)=>n,createBuffer:()=>({buffer:1})},{get(o,k){if(k in o)return o[k];if(typeof k==='string'&&k===k.toUpperCase())return k;return(...args)=>calls.push([k,...args])}});
 const a=await createPreviewFixedAccumulator(gl,{dependencies:[{createProgram:()=>({program:1})},{DISPLAY_VERT:'vertex'}]});
 const field=n=>({texture:n,fbo:'fbo'+n,width:128,height:128});const input={fixedP:field('fp'),fixedC:field('fc'),mobileP:field('mp'),mobileC:field('mc'),outP:field('op'),outC:field('oc'),weight:.2};
 calls.length=0;a.draw(input);assert.equal(calls.filter(c=>c[0]==='drawArrays').length,2);assert.deepEqual(calls.filter(c=>c[0]==='bindFramebuffer').map(c=>c[2]),['fboop','fbooc']);assert.deepEqual(calls.filter(c=>c[0]==='bindTexture').map(c=>c[2]),['fp','mp','fc','mc']);assert.ok(calls.some(c=>c[0]==='disable'&&c[1]==='BLEND'));
 calls.length=0;assert.throws(()=>a.draw({...input,outP:input.fixedP}));assert.equal(calls.length,0);a.disposeAfterKnownIdle();a.disposeAfterKnownIdle();assert.equal(calls.filter(c=>c[0]==='deleteProgram').length,1);
});
