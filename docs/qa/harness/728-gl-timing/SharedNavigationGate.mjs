export function sharedNavigationGate({arm,network,document,metadataShared,servedBundleExact}){
 if(!['0','1'].includes(arm))throw Error('Explicit arm required');
 const rows=network?.rows??[],paths=rows.filter(r=>r.phase==='request').map(r=>r.pathname);
 const optimized=paths.some(p=>p.endsWith('/@grafetto_shared.js'));
 const source=paths.some(p=>p.includes('/packages/shared/src/'));
 const complete=network?.dropped===0;
 const authority=arm==='1'?Boolean(metadataShared&&servedBundleExact&&optimized&&!source):Boolean(!metadataShared&&!optimized&&source);
 const formReady=document?.formTextCount===1&&document?.hasEngine===false;
 return{valid:complete&&authority&&formReady,complete,authority,optimized,source,formReady,scope:'Actual browser import routing and create-form readiness; no room or rendering'};
}
