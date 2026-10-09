export function sharedNavigationGate({arm,network,document,metadataShared,servedBundleExact}){
 if(!['0','1'].includes(arm))throw Error('Explicit arm required');
 const rows=network?.rows??[],finished=new Set(rows.filter(r=>r.phase==='finished').map(r=>r.requestId)),failed=new Set(rows.filter(r=>r.phase==='failed').map(r=>r.requestId));const paths=rows.filter(r=>r.phase==='response'&&r.originClass==='QA'&&r.status>=200&&r.status<300&&finished.has(r.requestId)&&!failed.has(r.requestId)).map(r=>r.pathname);
 const optimized=paths.some(p=>p.endsWith('/@grafetto_shared.js'));
 const source=paths.some(p=>p.includes('/packages/shared/src/'));
 const complete=network?.dropped===0;
 const authority=arm==='1'?Boolean(metadataShared&&servedBundleExact&&optimized&&!source):Boolean(!metadataShared&&!optimized&&source);
 const formReady=document?.formTextCount===1&&document?.hasEngine===false;
 return{valid:complete&&authority&&formReady,complete,authority,optimized,source,formReady,scope:'Actual browser import routing and create-form readiness; no room or rendering'};
}
