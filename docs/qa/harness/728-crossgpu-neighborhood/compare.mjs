import {readFileSync,writeFileSync} from 'node:fs';
export function compareRows(a,b){
  if(a.length!==b.length)return{invalid:'different actual capture counts',counts:[a.length,b.length]};
  const deltas=[],unknowns=[];let previousCapturedBytesEqual=null,previousFullyKnownInput=null;
  const geometry=r=>JSON.stringify({op:r.op,stage:r.stage,meta:r.meta,radius:r.radius,knight:r.knight,primary:r.primary,cells:r.cells});
  const keys=o=>Object.keys(o??{}).sort();
  function bytes(u,v,path,row){
    if(!Array.isArray(u)||!Array.isArray(v)||u.length!==v.length)return{invalid:'missing or differently sized captured bytes',ordinal:row.ordinal,key:path};
    let n=0,max=0;for(let i=0;i<u.length;i++){const d=Math.abs(u[i]-v[i]);if(d)n++;max=Math.max(max,d)}
    if(n)deltas.push({ordinal:row.ordinal,op:row.op,stage:row.stage,key:path,numDiff:n,max,previousCapturedBytesEqual,previousFullyKnownInput});
  }
  for(let i=0;i<a.length;i++){
    const unknownStart=unknowns.length;const x=a[i],y=b[i],row={ordinal:i,op:x.op,stage:x.stage};
    if(geometry(x)!==geometry(y))return{invalid:'capture geometry/order differs',ordinal:i,a:geometry(x),b:geometry(y)};
    if(JSON.stringify(keys(x.fields))!==JSON.stringify(keys(y.fields)))return{invalid:'field presence differs',ordinal:i};
    for(const key of keys(x.fields)){
      const u=x.fields[key],v=y.fields[key];if(!u&&!v){unknowns.push({ordinal:i,key,reason:'both fields missing'});continue;}
      if(!u?.bytes||!v?.bytes){if(JSON.stringify({...u,buffer:null})!==JSON.stringify({...v,buffer:null}))return{invalid:'missing/outside/unmapped field differs',ordinal:i,key};unknowns.push({ordinal:i,key,reason:u?.outside?'outside captured field':'unmapped or missing'});continue;}
      if(JSON.stringify(u.read)!==JSON.stringify(v.read))return{invalid:'different read bounds',ordinal:i,key};
      const error=bytes(u.bytes,v.bytes,key,row);if(error)return error;
    }
    if(JSON.stringify(keys(x.donors))!==JSON.stringify(keys(y.donors)))return{invalid:'donor presence differs',ordinal:i};
    for(const key of keys(x.donors)){
      const u=x.donors[key],v=y.donors[key];
      if(u?.known!==v?.known)return{invalid:'donor known/missing status differs',ordinal:i,key};
      if(!u?.known){unknowns.push({ordinal:i,key:'donors.'+key,reason:'unknown donor input'});continue;}
      if(u.patches.length!==v.patches.length)return{invalid:'donor patch count differs',ordinal:i,key};
      for(let j=0;j<u.patches.length;j++){
        const p=u.patches[j],q=v.patches[j],shape=o=>JSON.stringify({cell:o.cell,uv:o.uv,outside:!!o.outside,read:o.read});
        if(shape(p)!==shape(q))return{invalid:'donor physical geometry/outside differs',ordinal:i,key,patch:j};
        if(p.outside)continue; // Both are shader-dry; not a missing capture.
        const error=bytes(p.bytes,q.bytes,'donors.'+key+'.'+j,row);if(error)return error;
      }
    }
    const pu=x.paperDonors,pv=y.paperDonors;
    if(!!pu!==!!pv||pu?.known!==pv?.known)return{invalid:'paper provenance presence/known differs',ordinal:i};
    if(pu?.known){
      if(pu.samples.length!==pv.samples.length)return{invalid:'paper sample count differs',ordinal:i};
      for(let j=0;j<pu.samples.length;j++){
        const p=pu.samples[j],q=pv.samples[j],shape=o=>JSON.stringify({cell:o.cell,outside:!!o.outside,paperUV:o.paperUV,paperCells:o.paperCells,fraction:o.fraction});
        if(shape(p)!==shape(q))return{invalid:'paper footprint differs',ordinal:i,patch:j};
        if(!p.outside){const error=bytes(p.heightBytes,q.heightBytes,'paper.height.'+j,row);if(error)return error;}
      }
      if(!pu.uploadBindingVerified||!pv.uploadBindingVerified)unknowns.push({ordinal:i,key:'paper.upload',reason:'CPU view not proven actual bound upload'});
      unknowns.push({ordinal:i,key:'paper.gpuSampling',reason:'actual GPU height interpolation unmeasured'});
    }else if(pu||pv)unknowns.push({ordinal:i,key:'paper',reason:'no exact CPU paper bytes'});
    const unbound=o=>Object.fromEntries(Object.entries(o??{}).map(([k,v])=>[k,!!v.bound]));
    if(JSON.stringify(unbound(x.unusedArguments))!==JSON.stringify(unbound(y.unusedArguments)))return{invalid:'actual binding status differs',ordinal:i};
    if(x.externalUpload||y.externalUpload)unknowns.push({ordinal:i,key:'externalUpload',reason:'no exact bound upload byte capture; cannot infer equality'});
    if(!deltas.length||deltas.at(-1).ordinal!==i)previousCapturedBytesEqual=i;
    // No all-shader-input coverage proof exists; unknowns break any stronger chain.
    if(unknowns.length>unknownStart||x.fullyKnownShaderInputs!==true||y.fullyKnownShaderInputs!==true)previousFullyKnownInput=null;
    else if(!deltas.length||deltas.at(-1).ordinal!==i)previousFullyKnownInput=i;
  }
  return{validAligned:true,rows:a.length,firstCaptured:deltas[0]??null,first:deltas[0]??null,deltas,unknowns,capturedBytesEqual:deltas.length===0,allInputsEqual:false,scope:'first captured byte divergence only; unknown uploads/GPU paper sampling prevent all-input equality'};
}
if(process.argv[2]){
  const ar=JSON.parse(readFileSync(process.argv[2])),br=JSON.parse(readFileSync(process.argv[3])),a=ar.result??ar,b=br.result??br;
  const out={paperBytesEqual:!!a.paperBytesSHA&&!!b.paperBytesSHA&&a.paperBytesSHA===b.paperBytesSHA,comparison:compareRows(a.neighborhood.rows,b.neighborhood.rows)};
  if(process.argv[4])writeFileSync(process.argv[4],JSON.stringify(out,null,2));console.log(JSON.stringify(out));
}
