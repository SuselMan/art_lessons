export function assertSelectedFrontQuantum(quantum){
 if(!quantum||quantum.overflow||quantum.passes.length!==4||quantum.passes.some(p=>p.family!=='waterFrontStep'))throw Error('Selected op33 must encode exactly four original front passes before submit')
 const keys=['dryCost','max','climb','floor','stride','scale','sourceWidth','sourceHeight'],first=quantum.passes[0]
 for(const p of quantum.passes)for(const key of keys)if(!Number.isFinite(p[key])||p[key]!==first[key])throw Error('Selected front parameters differ/absent: '+key)
 if(first.stride!==1||first.scale<=0||first.max<=0||first.dryCost<0||first.climb<0||first.floor<0||!Number.isInteger(first.sourceWidth)||!Number.isInteger(first.sourceHeight)||first.sourceWidth<=0||first.sourceHeight<=0||first.sourceWidth>1536||first.sourceHeight>1536)throw Error('Selected front bounded canonical parameter guard')
 return{quantumId:quantum.id,passes:quantum.passes.map(p=>({...p})),source:'CanonicalPlanAdapter.waterFrontStep actual CPU arguments; checked before queue.submit'}
}
