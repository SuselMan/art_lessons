'use strict';
// Independent QA source fork. Production modules are never changed on disk.
const KEY='__qaNativeExpansion805';
function one(source,anchor,replacement){if(source.split(anchor).length!==2)throw Error('Expansion source drift: '+anchor.slice(0,100));return source.replace(anchor,replacement)}
function transformNativeExpansion805(file,source){
 const name=file.replaceAll('\\','/').split('/').pop();if(!['ContrastPhase.ts','WatercolorSettlePlan.ts'].includes(name))return source;
 if(source.includes('QA_NATIVE_EXPANSION_805'))throw Error('Expansion transform already applied');let s=source;
 if(name==='ContrastPhase.ts'){
  s=one(s," const background=new AccumulationBuffer",` const qaWetReference=createProgram(gl,vertex,common+'uniform sampler2D pigment;uniform float optical;void main(){vec4 raw=optical>.5?texture2D(color,uv):texture2D(pigment,uv);float wet=step(.000001,V(uv));gl_FragColor=raw*(1.-wet);}')\n const background=new AccumulationBuffer`);
  const anchor='return{selection:regionKeep,prepare(p:AccumulationBuffer,c:AccumulationBuffer,w:AccumulationBuffer,volume:boolean,referenceP:AccumulationBuffer,referenceC:AccumulationBuffer){';
  s=one(s,anchor,anchor+`const qa=(globalThis as unknown as {${KEY}?:{allWetMobile?:boolean}}).${KEY};if(qa?.allWetMobile===true){for(const [optical,out]of [[0,referenceP],[1,referenceC]]as const){begin(qaWetReference,out,{color:c,water:w,pigment:p},volume);gl.uniform1f(gl.getUniformLocation(qaWetReference,'optical'),optical);end(out)}regionKeep.clear();return;}`);
  s=one(s,'gl.deleteProgram(bg);gl.deleteProgram(split);','gl.deleteProgram(bg);gl.deleteProgram(split);gl.deleteProgram(qaWetReference);');
 }else{
  const anchor='        const list = strides ?? Array.from({ length: steps }, () => 1)';
  s=one(s,anchor,`        const qaExpansion=(globalThis as unknown as {${KEY}?:{radiusPx?:number;allWetMobile?:boolean}}).${KEY}
        const list = qaExpansion?.radiusPx!==undefined&&climb===WC_FRONT_CLIMB ? Array.from({length:Math.ceil(qaExpansion.radiusPx)},()=>1) : strides??Array.from({length:steps},()=>1)`);
 }
 return '// QA_NATIVE_EXPANSION_805\n'+s;
}
module.exports={KEY,transformNativeExpansion805};
