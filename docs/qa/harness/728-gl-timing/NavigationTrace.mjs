/** Passive bounded CDP network census. Never retain headers, cookies, query or full URLs. */
export function navigationTrace(cdp,qaOrigin,{limit=128}={}){
 limit=Math.max(1,Math.min(1024,Math.floor(limit)||128));
 const pending=new Map(),rows=[];let dropped=0;
 const location=value=>{try{const u=new URL(value);return{originClass:u.origin===qaOrigin?'QA':'other',pathname:u.pathname}}catch{return{originClass:'invalid',pathname:'invalid'}}};
 const record=row=>{if(rows.length<limit)rows.push(row);else dropped++};
 const start=e=>{const row={requestId:e.requestId,...location(e.request.url),type:e.type??null,at:e.timestamp};if(pending.size<limit)pending.set(e.requestId,row);else dropped++;record({phase:'request',...row})};
 const response=e=>record({phase:'response',requestId:e.requestId,...location(e.response.url),status:e.response.status,type:e.type??null,at:e.timestamp,tls:e.response.securityDetails?{protocol:e.response.securityDetails.protocol,issuer:e.response.securityDetails.issuer,validFrom:e.response.securityDetails.validFrom,validTo:e.response.securityDetails.validTo}:null});
 const finish=e=>{pending.delete(e.requestId);record({phase:'finished',requestId:e.requestId,at:e.timestamp})};
 const failure=e=>{pending.delete(e.requestId);record({phase:'failed',requestId:e.requestId,errorText:e.errorText,canceled:!!e.canceled,at:e.timestamp})};
 const hooks=[['Network.requestWillBeSent',start],['Network.responseReceived',response],['Network.loadingFinished',finish],['Network.loadingFailed',failure]];
 for(const[event,listener]of hooks)cdp.on(event,listener);
 return{snapshot:()=>({rows:structuredClone(rows),pending:structuredClone([...pending.values()]),dropped,scope:'Passive network stage only; no response bodies/auth/headers/query/fullURL'}),close:()=>{for(const[event,listener]of hooks)cdp.off(event,listener)}};
}
