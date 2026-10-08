import fs from 'node:fs'
const material=[['P','inkLoad','inkBase'],['C','inkColor','colorBase']]
/** Compare ONLY equal world pixels and epochs; changed crop sums are not mass loss. */
export function analyzeSettleBoundaries(source,settle,readFile){
 const failures=[],links=[],key=r=>JSON.stringify(r.sourceMetadata?.worldROI),seen=new Set()
 for(const r of source){const g=r.sourceMetadata?.gesture;if(!Number.isSafeInteger(g)||seen.has(g))failures.push('Source gesture missing or duplicated');seen.add(g)}
 const compare=(a,b)=>{
  if(!a||!b)return{observed:false,reason:'Missing measured role'}
  if(a.absent||b.absent)return{observed:true,exact:a.absent===b.absent,absence:[!!a.absent,!!b.absent],scope:'Absence, not synthetic zero mass'}
  const x=readFile(a.file),y=readFile(b.file);if(x.length!==y.length)throw Error('Causal field byte dimensions differ')
  let changed=0,max=0;const channelDelta=[0,0,0,0]
  for(let i=0;i<x.length;i++){const d=y[i]-x[i];changed+=d!==0;max=Math.max(max,Math.abs(d));channelDelta[i%4]+=d}
  return{observed:true,exact:changed===0,changedBytes:changed,maxQ8:max,channelDelta,scope:'Same cropped Q8 records, not global mass'}
 }
 for(const job of settle){if(job.skipped){links.push({ordinal:job.ordinal,skipped:true});continue}
  const [before,after]=job.stages??[],g=before?.gesture,index=source.findIndex(r=>r.sourceMetadata?.gesture===g),current=source[index],next=source[index+1]
  if(!current||!job.published||before?.phase!=='before-prepare'||after?.phase!=='after-finish'||before.gesture!==after.gesture||before.materialGesture!==after.materialGesture||JSON.stringify(before.worldROI)!==key(current)||JSON.stringify(after.worldROI)!==key(current)){failures.push(`settle${job.ordinal}: chronology/world ROI invalid`);continue}
  if(next&&(next.sourceMetadata.gesture<=g||key(next)!==key(current))){failures.push(`settle${job.ordinal}: successor chronology/world ROI invalid`);continue}
  const row={ordinal:job.ordinal,gesture:g,materialGesture:before.materialGesture,filmEpoch:[before.filmGesture,after.filmGesture],nextGesture:next?.sourceMetadata.gesture??null,roles:{}}
  for(const [sourceRole,boundaryRole,nextBase]of material){const s=current.stages.find(s=>s.stage==='post-'+sourceRole),b=before.roles.find(r=>r.role===boundaryRole),a=after.roles.find(r=>r.role===boundaryRole),n=next?.stages.find(s=>s.stage==='source-'+nextBase)
   row.roles[sourceRole]={previousPostToBefore:compare(s,b),beforeToAfter:compare(b,a),afterToNextBase:next?compare(a,n):{observed:false,reason:'No next contact'}}
  }
  links.push(row)
 }
 return{valid:!failures.length,failures,links,scope:'Epoch/world-bound causal localization; no conservation or artistic claim'}
}
if(process.argv[1]?.endsWith('settle-boundary-analysis.mjs')&&process.argv[2]){const dir=process.argv[2],source=JSON.parse(fs.readFileSync(dir+'/moment-stages.json')),settle=JSON.parse(fs.readFileSync(dir+'/settle-boundaries.json'));const report=analyzeSettleBoundaries(source,settle,file=>fs.readFileSync(dir+'/'+file));fs.writeFileSync(dir+'/settle-causal-analysis.json',JSON.stringify(report,null,2));if(!report.valid)process.exitCode=1}
