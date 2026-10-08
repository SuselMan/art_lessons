/** QA-only bounded checkpoint controls. Production/default solver is unchanged. */
export interface InwardDiagnostic {stopAfter:number;sourceFilter?:'manual'|'hardware'}
export function validateInwardDiagnostic(value:unknown,hasInward11Passport:boolean):InwardDiagnostic|undefined {
 if(value===undefined)return undefined
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Bounded inward diagnostic schema')
 const v=value as Record<string,unknown>
 if(Object.keys(v).some(k=>k!=='stopAfter'&&k!=='sourceFilter')||!Number.isInteger(v.stopAfter)||(v.stopAfter as number)<1||(v.stopAfter as number)>11||![undefined,'manual','hardware'].includes(v.sourceFilter as undefined|string))throw Error('Bounded inward diagnostic schema')
 if(!hasInward11Passport)throw Error('Diagnostic requires actual inward11 passport')
 return {stopAfter:v.stopAfter as number,...(v.sourceFilter===undefined?{}:{sourceFilter:v.sourceFilter as 'manual'|'hardware'})}
}
export function boundedByteDifferences(actual:Uint8Array,expected:Uint8Array,width:number,limit=32){
 if(actual.length!==expected.length||actual.length%4!==0||!Number.isInteger(width)||width<=0||actual.length%(width*4)!==0||!Number.isInteger(limit)||limit<0||limit>32)throw Error('Bounded difference shape')
 const channels=Array.from({length:4},()=>({changed:0,max:0,sum:0})),differences:Array<{x:number;y:number;channel:number;expected:number;actual:number}>=[]
 for(let i=0;i<actual.length;i++){const delta=Math.abs(actual[i]-expected[i]),c=channels[i%4];if(delta){c.changed++;if(differences.length<limit){const cell=Math.floor(i/4);differences.push({x:cell%width,y:Math.floor(cell/width),channel:i%4,expected:expected[i],actual:actual[i]})}}c.max=Math.max(c.max,delta);c.sum+=delta}
 return {channels,differences,differencesTruncated:channels.reduce((n,c)=>n+c.changed,0)>differences.length}
}
