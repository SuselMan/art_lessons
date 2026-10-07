import {readFileSync,writeFileSync} from 'node:fs';
export function compareRows(a,b){
  if(a.length!==b.length)return{invalid:'different actual capture counts',counts:[a.length,b.length]};
  const deltas=[];let previousEqual=null;
  for(let i=0;i<a.length;i++){
    const x=a[i],y=b[i],geometry=r=>JSON.stringify({op:r.op,stage:r.stage,meta:r.meta,radius:r.radius,knight:r.knight,primary:r.primary});
    if(geometry(x)!==geometry(y))return{invalid:'capture geometry/order differs',ordinal:i,a:geometry(x),b:geometry(y)};
    for(const key of Object.keys(x.fields)){
      const u=x.fields[key],v=y.fields[key];if(!u&&!v)continue;
      if(!u?.bytes||!v?.bytes){if(JSON.stringify({...u,buffer:null})!==JSON.stringify({...v,buffer:null}))return{invalid:'unmapped field differs',ordinal:i,key};continue;}
      if(JSON.stringify(u.read)!==JSON.stringify(v.read)||u.bytes.length!==v.bytes.length)return{invalid:'different read bounds',ordinal:i,key};
      let n=0,max=0;for(let j=0;j<u.bytes.length;j++){const d=Math.abs(u.bytes[j]-v.bytes[j]);if(d)n++;max=Math.max(max,d)}
      if(n)deltas.push({ordinal:i,op:x.op,stage:x.stage,key,numDiff:n,max,previousEqual});
    }
    if(!deltas.length||deltas.at(-1).ordinal!==i)previousEqual=i;
  }
  return{validAligned:true,rows:a.length,first:deltas[0]??null,deltas,scope:'first captured byte divergence only; CPU paper interpolation is not measured GPU height'};
}
if(process.argv[2]){
  const ar=JSON.parse(readFileSync(process.argv[2])),br=JSON.parse(readFileSync(process.argv[3])),a=ar.result??ar,b=br.result??br;
  const out={paperBytesEqual:a.paperBytesSHA===b.paperBytesSHA,comparison:compareRows(a.neighborhood.rows,b.neighborhood.rows)};
  if(process.argv[4])writeFileSync(process.argv[4],JSON.stringify(out,null,2));console.log(JSON.stringify(out));
}
