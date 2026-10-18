'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function writeArtifact(destination,bytes,store){
 if(!store){fs.writeFileSync(destination,bytes,{mode:0o600});return}
 assert.ok(path.isAbsolute(store));fs.mkdirSync(store,{recursive:true,mode:0o700});const digest=sha(bytes),canonical=path.join(store,digest);
 try{fs.writeFileSync(canonical,bytes,{mode:0o600,flag:'wx'})}catch(error){if(error.code!=='EEXIST')throw error;assert.equal(sha(fs.readFileSync(canonical)),digest,'Existing immutable artifact corrupted')}
 try{fs.linkSync(canonical,destination)}catch(error){if(error.code!=='EEXIST')throw error;assert.equal(sha(fs.readFileSync(destination)),digest,'Existing evidence destination differs')}
}
module.exports={writeArtifact};
