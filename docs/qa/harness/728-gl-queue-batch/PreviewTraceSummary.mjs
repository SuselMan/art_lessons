/** Submission chronology only. Filmstrip is a separate visibility proof. */
export function previewTraceSummary(trace,sequence){
 const seal=trace.find(x=>x.kind==='seal'&&x.sequence===sequence),first=trace.find(x=>x.kind==='owned-preview-step'&&x.sequence===sequence),predecessor=trace.find(x=>x.kind==='land'&&x.sequence===sequence-1),own=trace.find(x=>x.kind==='land'&&x.sequence===sequence),events=trace.filter(x=>x.kind==='owned-preview-step'&&x.sequence===sequence);
 return{sequence,steps:events.length,sealAt:seal?.at,firstStepAt:first?.at,firstStepAfterSealMs:seal&&first?first.at-seal.at:null,predecessorLandAt:predecessor?.at,stepBeforePredecessorLand:!!(first&&predecessor&&first.at<predecessor.at),ownLandAt:own?.at,limitation:'CPU command-submission markers; not physical scanned-out pixels'}
}
