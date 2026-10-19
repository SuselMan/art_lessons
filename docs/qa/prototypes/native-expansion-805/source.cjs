'use strict';
// Independent QA source fork. Production modules are never changed on disk.
const KEY='__qaNativeExpansion805';
function one(source,anchor,replacement){if(source.split(anchor).length!==2)throw Error('Expansion source drift: '+anchor.slice(0,100));return source.replace(anchor,replacement)}
function transformNativeExpansion805(file,source,profile='smooth'){
 const name=file.replaceAll('\\','/').split('/').pop();if(!['ContrastPhase.ts','WatercolorSettlePlan.ts'].includes(name))return source;
 if(source.includes('QA_NATIVE_EXPANSION_805'))throw Error('Expansion transform already applied');let s=source;
 if(name==='ContrastPhase.ts'){
  s=one(s," const background=new AccumulationBuffer",` const qaWetReference=createProgram(gl,vertex,common+'uniform sampler2D pigment;uniform float optical;void main(){vec4 raw=optical>.5?texture2D(color,uv):texture2D(pigment,uv);float wet=step(.000001,V(uv));gl_FragColor=raw*(1.-wet);}')\n const background=new AccumulationBuffer`);
  const anchor='return{selection:regionKeep,prepare(p:AccumulationBuffer,c:AccumulationBuffer,w:AccumulationBuffer,volume:boolean,referenceP:AccumulationBuffer,referenceC:AccumulationBuffer){';
  s=one(s,anchor,anchor+`const qa=(globalThis as unknown as {${KEY}?:{allWetMobile?:boolean}}).${KEY};if(qa?.allWetMobile===true){for(const [optical,out]of [[0,referenceP],[1,referenceC]]as const){begin(qaWetReference,out,{color:c,water:w,pigment:p},volume);gl.uniform1f(gl.getUniformLocation(qaWetReference,'optical'),optical);end(out)}regionKeep.clear();return;}`);
  s=one(s,'gl.deleteProgram(bg);gl.deleteProgram(split);','gl.deleteProgram(bg);gl.deleteProgram(split);gl.deleteProgram(qaWetReference);');
 }else{
  s=one(s,'const CAP = 1536 * S',`const CAP = (this as any).qaFullSheet805===true ? Infinity : 1536*S`);
  const anchor='        const list = strides ?? Array.from({ length: steps }, () => 1)';
  s=one(s,anchor,`        const qaExpansion=(globalThis as unknown as {${KEY}?:{radiusPx?:number;allWetMobile?:boolean}}).${KEY}
        const qaList = qaExpansion?.radiusPx!==undefined&&climb===WC_FRONT_CLIMB ? Array.from({length:Math.ceil(qaExpansion.radiusPx)},()=>1) : strides??Array.from({length:steps},()=>1)
        const list = ${['paths2','combined','combined4','combosafe','combomask'].includes(profile)?'climb===WC_FRONT_CLIMB?Array.from({length:Math.ceil(qaList.length/2)},(_,i)=>i*2+1<qaList.length?2:1):qaList':'qaList'}`);
 }
 if(name==='WatercolorSettlePlan.ts'&&['transport2','combined','combined4'].includes(profile)){
  s=one(s,'const carry = watercolorCarryStrides(budgetPx)',`const qaCarry = watercolorCarryStrides(budgetPx);const carry=qaCarry.filter((_,i)=>i%2===0).map((v,i)=>v+(qaCarry[i*2+1]??0))`);
  s=one(s,'this.ctx.ab().noDiffuse ? [] : WET_DIFFUSE_SCHEDULE','this.ctx.ab().noDiffuse ? [] : WET_DIFFUSE_SCHEDULE.filter((_,i)=>i%2===0)');
  s=one(s,'? WET_DIFFUSE_PUDDLE_SCHEDULE : []','? WET_DIFFUSE_PUDDLE_SCHEDULE.filter((_,i)=>i%2===0) : []');
 }
 if(name==='WatercolorSettlePlan.ts'&&['rim2','combined','rim4','combined4','combosafe','combomask'].includes(profile)){
  const a='for (let st = 1; st <= Math.max(1, radiusPx / 2) && gather.length < 6; st *= 2) gather.push([st, st])';
  s=one(s,a,a+`;const qaGather=gather.splice(0);for(let i=0;i<qaGather.length;i+=2){const r=Math.round(Math.hypot(qaGather[i][0],qaGather[i+1]?.[0]??0));gather.push([r,r])}`);
 }
 if(name==='WatercolorSettlePlan.ts'&&['rim4','combined4','combosafe','combomask'].includes(profile)){
  const begin=s.indexOf('    const pp = { src: field.mask, dst: field.band }',s.indexOf('  groupTideOps('));const end=s.indexOf('    const gather:',begin);if(begin<0||end<begin)throw Error('Group inward schedule source drift');
  s=s.slice(0,begin)+`    const pp = { src: field.mask, dst: field.band }
    const qaInward=[4,4,2,1,1]
    qaInward.forEach((stride,i)=>ops.push(()=>{
      this.ctx.passes().waterFrontStep(field,x0,y0,WC_FRONT_DRY_COST,pp.src,pp.dst,costMaxIn,0,1,stride,scale,null,discreteGrid)
      const previous=pp.src;pp.src=pp.dst;pp.dst=previous
      if(i===qaInward.length-1&&pp.src!==field.mask)materialFieldOp(field.mask,pp.src,pp.src,1,0)
    }))
`+s.slice(end);
 }
 if(name==='WatercolorSettlePlan.ts'&&['mixsafe','combosafe','combomask'].includes(profile)){
  s=one(s,'      const advance = (radius: number, knight: boolean, gate = field.coverage): void => {','      let qaExchangeIndex=0\n      const advance = (radius: number, knight: boolean, gate = field.coverage): void => {');
  const a='        if (paired) diffuseStep(paired.src, paired.dst, radius, knight, gate, st.src)\n        diffuseStep(st.src, st.dst, radius, knight, gate, st.src)';
  s=one(s,a,`        if(qaExchangeIndex++%2===1){if(paired)paired.src.copyTo(paired.dst);st.src.copyTo(st.dst)}else{
${a}
        }`);
 }
 return '// QA_NATIVE_EXPANSION_805\n'+s;
}
module.exports={KEY,transformNativeExpansion805};
