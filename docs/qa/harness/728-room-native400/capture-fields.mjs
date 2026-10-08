/** Browser diagnostic only, AFTER canonical idle; sequential readback, no timing claim. */
export async function captureOwnerFields({waterOnly=false}={}) {
 const e=window.__engine,runtime=e?._wcNative,owner=runtime?.owner
 if(!owner||e._wcCanonical.pending||e._settle)throw Error('Owner fields require actual native owner and idle boundary')
 const records=[],seen=new Set();let totalBytes=0
 const capture=async(role,b)=>{
  if(!b){records.push({role,absent:true});return}
  if(b.destroyed)throw Error('Released owner field '+role)
  const bytes=await b.readBytes();if(bytes.length!==b.width*b.height*4)throw Error('Owner field dimensions '+role)
  totalBytes+=bytes.length;if(totalBytes>256*1024*1024)throw Error('Diagnostic aggregate256MiB cap')
  let nonzero=0;const sums=[0,0,0,0],max=[0,0,0,0];for(let i=0;i<bytes.length;i++){nonzero+=bytes[i]!==0;sums[i%4]+=bytes[i];max[i%4]=Math.max(max[i%4],bytes[i])}
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('')
  records.push({role,width:b.width,height:b.height,bytes:bytes.length,nonzero,sums,max,sha})
 }
 await capture('material',owner.target.buffer)
 let index=0;for(const [,entry]of owner.scratch.tileEntries()){
  for(const key of ['original','coverage','coverageFilm','inkLoad','inkSettled','inkColor','colorSettled','strokeInk','inkBase','strokeColor','colorBase','inkDry','colorDry','foreignSolventLoad','solventLoad','solventBase','strokeSolvent'])await capture('tile'+index+':'+key,entry[key]);index++
 }
 const field=owner.fields?.current;if(field)for(const key of ['a','b','c','coverage','ca','cb','cc','mask','pressure','band'])await capture('settle:'+key,field[key])
 for(const [key,aux]of owner.foreignAux??[])for(const [,entry]of aux.scratch.tileEntries())for(const name of ['coverage','solventLoad','solventBase','strokeSolvent'])await capture('foreign:'+key+':'+name,entry[name])
 for(const r of records){if(seen.has(r.role))throw Error('Duplicate owner role');seen.add(r.role)}
 const pigment=records.filter(r=>/^tile\d+:(inkLoad|strokeInk|inkDry|inkSettled)$/.test(r.role)&&!r.absent)
 const color=records.filter(r=>/^tile\d+:(inkColor|strokeColor|colorDry|colorSettled)$/.test(r.role)&&!r.absent)
 const water=records.filter(r=>/:solventLoad$/.test(r.role)&&!r.absent)
 const failures=[];if(waterOnly){if(!pigment.length)failures.push('Water P0 gate missing actual pigment fields');if(pigment.some(r=>r.sums[2]!==0))failures.push('Water-only actual pigment mass P.B is not zero');if(!color.length)failures.push('Water C gate missing actual color fields');if(color.some(r=>r.nonzero))failures.push('Water-only actual color field is not zero');if(!water.some(r=>r.nonzero))failures.push('Water-only actual solvent field empty')}
 return{records,totalBytes,waterOnly,gatePassed:failures.length===0,failures,pigmentZero:pigment.every(r=>r.sums[2]===0),colorZero:color.every(r=>r.nonzero===0),packing:'P.Rwater Gwet Bpigment Aamount; C allchannels mustzero for purewater',waterNonempty:water.some(r=>r.nonzero>0),scope:'Sequential post-idle diagnostic fields; no transient/source parity or performance claims'}
}
