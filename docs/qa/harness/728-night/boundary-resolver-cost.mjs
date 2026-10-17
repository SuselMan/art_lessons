import inspector from 'node:inspector';import fs from 'node:fs';
const profilePath=process.env.QA_CPU_PROFILE,session=profilePath?new inspector.Session():null;session?.connect();const post=method=>new Promise((resolve,reject)=>session.post(method,(error,result)=>error?reject(error):resolve(result)));if(session)await post('Profiler.enable');
import {pathToFileURL} from 'node:url';
const root=process.argv[2];const {OperationLog}=await import(pathToFileURL(root+'/apps/web/src/engine/src/oplog/OperationLog.ts'));
for(const count of (process.env.QA_POOL_COUNTS??'20,60,120').split(',').map(Number)){
 const log=new OperationLog();let seq=0;
 const push=op=>{log.append({...op,seq:++seq},{serverSeq:seq},false);if(op.type==='operation_undo')log.applyUndo(op.targetOpId,op.userId);if(op.type==='operation_redo')log.applyRedo(op.targetOpId,op.userId)};
 const control=(type,targetOpId,userId)=>push({id:'c'+seq,type,targetOpId,userId,timestamp:1000+seq});
 const wet=(id,userId,index)=>({id,type:'stroke',userId,layerId:'L',strokeId:id,washId:'m70:L',timestamp:100+seq,tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',color:[0,0,1],dabs:[{x:(index%20)*20,y:Math.floor(index/20)*20,size:4,aspectRatio:1,angle:0,opacity:1,pressure:1,tiltX:0,tiltY:0,t:0}]});
 for(let i=0;i<count;i++)push(wet('a'+i,'A',i));
 push({id:'dry',type:'paper_dry',userId:'C',layerId:'L',timestamp:100+seq});
 for(let i=0;i<count;i++)push(wet('b'+i,'B',i));
 control('operation_undo','dry','C');for(let i=0;i<count;i++)control('operation_undo','a'+i,'A');
 log.watercolorEffectiveOperations();const samples=[];
 for(let j=0;j<3;j++){control('operation_redo','dry','C');log.watercolorEffectiveOperations();control('operation_undo','dry','C');if(session&&j===2)await post('Profiler.start');const start=performance.now();const material=log.watercolorEffectiveOperations();samples.push({ms:+(performance.now()-start).toFixed(2),waterOnly:material.filter(op=>op.type==='stroke'&&op.userId==='A').length});if(session&&j===2){const {profile}=await post('Profiler.stop');fs.writeFileSync(profilePath,JSON.stringify(profile));}}
 console.log(JSON.stringify({source:root.split('/').pop(),independentPools:count,entries:log.entries.length,samples}));
}

session?.disconnect();
