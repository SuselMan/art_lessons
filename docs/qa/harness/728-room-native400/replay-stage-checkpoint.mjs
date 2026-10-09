const phases=new Set(['append','logicalIdle','existingAckDone','roleReadStart','roleReadDone'])
export function nativeReplayStageCheckpoint(phase,operationIndex,role=null){
 try{const e=window.__engine,r=e?._wcNative,b=r?.backend;console.debug('[native-replay-stage]',JSON.stringify({phase,operationIndex,operationId:window.__nativeReplayOperationIds?.[operationIndex]??null,role,at:performance.now(),pending:e?._wcCanonical?.pending===true,centralIdle:r?.central?.isIdle===true,scopePending:b?.diagnosticScopeState?.pending??null,ownerEpoch:r?.owner?.generation??null}))}catch{/* QA observer cannot interrupt original work. */}
}
export function parseReplayStageCheckpoint(event){
 const args=event.params?.args??[];if(args[0]?.value!=='[native-replay-stage]')return null
 const r=JSON.parse(args[1]?.value);if(typeof r.operationId!=='string'||r.operationId.length<1||r.operationId.length>64||!phases.has(r.phase)||!Number.isInteger(r.operationIndex)||r.operationIndex<0||r.operationIndex>1||!Number.isFinite(r.at)||r.at<0||typeof r.pending!=='boolean'||typeof r.centralIdle!=='boolean'||!(r.scopePending===null||Number.isInteger(r.scopePending)&&r.scopePending>=0)||!(r.ownerEpoch===null||Number.isInteger(r.ownerEpoch)&&r.ownerEpoch>=1)||!(r.role===null||['pressure','mask','coverage','pigment','color'].includes(r.role)))throw Error('Invalid bounded replay stage')
 return r
}
