'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{hash}=require('./owned-loader.cjs');
function saveCarrier(result,directory,ordinal,required){
 const carrier=result.carrierBase64;delete result.carrierBase64; // Never let raw base64 enter report JSON, even on failure.
 if(!required)return null;
 assert.equal(typeof carrier,'string','exportRaw requires v6 carrierBase64');assert.ok(Array.isArray(result.hashes)&&result.hashes.length);
 const data=Buffer.from(carrier,'base64');assert.equal(data.length,1024*1024*4,'1024 RGBA carrier');const sha=hash(data);assert.equal(sha,result.hashes[0],'Carrier SHA must equal first deterministic result SHA');
 const gzip=zlib.gzipSync(data,{level:6}),file=String(ordinal).padStart(3,'0')+'-output.rgba.gz';fs.writeFileSync(path.join(directory,file),gzip,{mode:0o600});fs.chmodSync(path.join(directory,file),0o600);
 return{file,bytes:data.length,gzipBytes:gzip.length,sha256:sha,gzipSha256:hash(gzip),qualification:'Returned output encoded after timing; no added GPU read'};
}
module.exports={saveCarrier};
