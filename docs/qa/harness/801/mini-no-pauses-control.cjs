const crypto=require('node:crypto'),assert=require('node:assert/strict');
const CONTROLLER_PATH='/mini-assets/chunk-7Q6CHNG6.js';
const ORIGINAL_SHA='d83ae10fa6a2fce07484f947004b49cd36ed2cef8e714810310a446c33888850';
const replacements=[['.step(4)','.step(100000)'],['function $(t=60){','function $(t=0){']];
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function makeMiniControl(source,batch){assert.equal(hash(source),ORIGINAL_SHA,'Frozen deployed controller source changed');const counts=replacements.map(([before])=>source.split(before).length-1);assert.deepEqual(counts,[1,1],'Exact two patch anchors required');let body=source;if(batch)for(const [before,after]of replacements)body=body.replace(before,after);return{body,originalSHA:ORIGINAL_SHA,responseSHA:hash(body),counts,changes:batch?replacements:[],batch,qualification:'Owned response only: preserve operation order/math, remove default goal launch debounce and per-frame op cap; time-dependent intermediate preview insertion can differ.'}}
function matchesOwnedController(url,origin){const u=new URL(url);return u.origin===origin&&u.pathname===CONTROLLER_PATH}
module.exports={makeMiniControl,matchesOwnedController,CONTROLLER_PATH,ORIGINAL_SHA};
