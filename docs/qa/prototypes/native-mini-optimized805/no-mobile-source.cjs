'use strict';
// Opt-in QA source fork. Never edits or replaces the default engine modules.
const KEY='__qaNativeMiniNoMobile805',PROOF_KEY='__qaNativeMiniRetainedZero805';
const ZERO_SOURCE=`(bytes:Uint8Array):boolean=>{for(let i=0;i<bytes.length;i++)if(bytes[i]!==0)return false;return true}`;
const SCOPE_SOURCE=`<T>(owner:object,proof:boolean,work:()=>T):T=>{const key=${JSON.stringify(PROOF_KEY)},saved=Object.getOwnPropertyDescriptor(owner,key);Object.defineProperty(owner,key,{configurable:true,writable:true,value:proof});try{return work()}finally{if(saved)Object.defineProperty(owner,key,saved);else Reflect.deleteProperty(owner,key)}}`;
const GUARD_SOURCE=`(proof:boolean,model:unknown,scale:number,paints:number,contactsDisabled:boolean,paired:boolean,pureWater:boolean,plateau:boolean,costPaths:boolean):boolean=>proof&&model==='front8-detail-flow-v4'&&scale===1&&paints===1&&contactsDisabled&&!paired&&!pureWater&&!plateau&&!costPaths`;
function one(source,anchor,replacement){if(source.split(anchor).length!==2)throw Error('No-mobile source drift: '+anchor.slice(0,100));return source.replace(anchor,replacement)}
function transformNoMobile(file,source){
 const name=file.replaceAll('\\','/').split('/').pop();if(!['ContrastPhase.ts','PuddleTarget.ts','WatercolorSettlePlan.ts'].includes(name))return source;if(source.includes('QA_NATIVE_MINI_NO_MOBILE_805')||source.includes(PROOF_KEY)||source.includes(KEY))throw Error('No-mobile transform already applied');let s=source;
 if(name==='ContrastPhase.ts'){
  s=one(s,'gl.activeTexture(gl.TEXTURE0);regionKeep.writePixels(keep);',`const qaRetainedAllZero=(${ZERO_SOURCE})(keep);gl.activeTexture(gl.TEXTURE0);regionKeep.writePixels(keep);`);
  s=one(s,'run(0,referenceP);run(1,referenceC);',`run(0,referenceP);run(1,referenceC);return{policy:'qa-retained-zero-v1',retainedAllZero:qaRetainedAllZero};`);
 }else if(name==='PuddleTarget.ts'){
  const anchor='contrast.prepare(entry.inkLoad!,entry.inkColor!,initialWater,true,entry.inkSettled!,entry.colorSettled!)';
  s=one(s,anchor,`const qaContrastProof=${anchor} as unknown as {policy?:string;retainedAllZero?:boolean}|undefined;const qaRetainedAllZero=qaContrastProof?.policy==='qa-retained-zero-v1'&&qaContrastProof.retainedAllZero===true`);
  s=one(s,'job = prepare.call(owner, clone, [tile], bounds, bloom, radius, 1, 0, standing, 1, 0,',`job = (${SCOPE_SOURCE})(owner,qaRetainedAllZero,()=>prepare.call(owner, clone, [tile], bounds, bloom, radius, 1, 0, standing, 1, 0,`);
  s=one(s,'}, false, undefined, true)\n        state.total','}, false, undefined, true))\n        state.total');
 }else{
  const anchor='    const singleTau: [number, number, number] = !colour && singlePaint ? pigmentAbsorption(singlePaint.split(\',\').map(Number) as [number, number, number]) : [0, 0, 0]';
  s=one(s,anchor,anchor+`
    const qaSkipEmptyMobile=(${GUARD_SOURCE})((this as unknown as {${PROOF_KEY}?:boolean}).${PROOF_KEY}===true,materialModel,S,metadata.paints.size,skipBrushContacts,colour!==null,pureWater,plateauPhase,costPathsEnabled)
    const qaStatsScope=globalThis as unknown as {${KEY}?:{policy:string;jobsSeen:number;jobsActivated:number;frontPassesOmitted:number;frontFixedPointPasses:number;carryZeroClears:number;diffuseZeroClears:number;lastActivated:boolean}}
    const qaNoMobileStats=qaStatsScope.${KEY}??={policy:'qa-native-mini-no-mobile-v1',jobsSeen:0,jobsActivated:0,frontPassesOmitted:0,frontFixedPointPasses:0,carryZeroClears:0,diffuseZeroClears:0,lastActivated:false}
    qaNoMobileStats.jobsSeen++;qaNoMobileStats.lastActivated=qaSkipEmptyMobile;if(qaSkipEmptyMobile)qaNoMobileStats.jobsActivated++`);
  const runAnchor='        const list = strides ?? Array.from({ length: steps }, () => 1)';
  s=one(s,runAnchor,runAnchor+`
        if(qaSkipEmptyMobile&&list.length>0){
          // Uniform cost 1 (out) / 0 (in) is a min-plus fixed point. One
          // stride1 pass is STILL required: the original shader writes G=paper height.
          ops.push(frontStepOp(()=>{frontStep(pp.src,pp.dst,max,climb,floor,1);if(pp.dst!==home)materialFieldOp(home,pp.dst,pp.dst,1,0);pp.src=home;pp.dst=tmp;qaNoMobileStats.frontFixedPointPasses++;qaNoMobileStats.frontPassesOmitted+=Math.max(0,list.length-1)}));return
        }`);
  const diffuse='        diffuseStep(st.src, st.dst, radius, knight, gate, st.src)';
  s=one(s,diffuse,'        if(qaSkipEmptyMobile){st.dst.clear();qaNoMobileStats.diffuseZeroClears++}else '+diffuse.trim());
  const carry='              materialFieldOp(p.dst, p.src, b, 15, WC_CARRY_RATE, opts)';
  s=one(s,carry,'              if(qaSkipEmptyMobile){p.dst.clear();qaNoMobileStats.carryZeroClears++}else '+carry.trim());
 }
 return '// QA_NATIVE_MINI_NO_MOBILE_805\n'+s;
}
module.exports={transformNoMobile,KEY,PROOF_KEY,ZERO_SOURCE,SCOPE_SOURCE,GUARD_SOURCE};
