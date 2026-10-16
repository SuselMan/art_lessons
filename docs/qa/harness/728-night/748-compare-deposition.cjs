// Only compact reports are read; no private auth or gateway URL is needed.
const fs=require('fs'),assert=require('node:assert/strict');
const [leftPath,rightPath]=process.argv.slice(2);if(!leftPath||!rightPath)throw Error('Usage: compare left/report.json right/report.json');
const left=JSON.parse(fs.readFileSync(leftPath)),right=JSON.parse(fs.readFileSync(rightPath));assert.equal(left.inputSHA,right.inputSHA,'Input bytes differ');
const differences=(a,b,path='',out=[])=>{if(out.length>=12)return out;if(JSON.stringify(a)===JSON.stringify(b))return out;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const key of new Set([...Object.keys(a),...Object.keys(b)]))differences(a[key],b[key],path+'.'+key,out)}else out.push({path,left:a,right:b});return out};
const result={inputSHA:left.inputSHA,left:left.deposition.identity,right:right.deposition.identity,leftTarget:left.target?.hash,rightTarget:right.target?.hash,drawsCompared:Math.min(left.deposition.calls.length,right.deposition.calls.length),programSourcesEqual:JSON.stringify(left.deposition.programs)===JSON.stringify(right.deposition.programs),unavailableUniforms:{left:[],right:[]},firstInputDifference:null,firstStateDifference:null,firstBufferDifference:null};
for(let i=0;i<result.drawsCompared;i++){
 const a=left.deposition.calls[i],b=right.deposition.calls[i];assert.equal(a.index,b.index,'Draw sequence differs');
 for(const [side,record]of [['left',a],['right',b]])for(const[name,value]of Object.entries(record.uniforms))if(value?.unavailable&&!result.unavailableUniforms[side].includes(name))result.unavailableUniforms[side].push(name);
 const common=Object.keys(a.uniforms).filter(name=>name in b.uniforms&&!a.uniforms[name]?.unavailable&&!b.uniforms[name]?.unavailable);
 if(!result.firstInputDifference){const d=differences({kind:a.kind,args:a.args,draw:a.draw,uniforms:Object.fromEntries(common.map(k=>[k,a.uniforms[k]]))},{kind:b.kind,args:b.args,draw:b.draw,uniforms:Object.fromEntries(common.map(k=>[k,b.uniforms[k]]))});if(d.length)result.firstInputDifference={index:a.index,differences:d}}
 if(!result.firstStateDifference){const differencesInState=differences(a.state,b.state);if(differencesInState.length)result.firstStateDifference={index:a.index,differences:differencesInState}}
 if(!result.firstBufferDifference&&(a.beforeSHA!==b.beforeSHA||a.afterSHA!==b.afterSHA))result.firstBufferDifference={index:a.index,kind:a.kind,mode:a.args.mode,beforeEqual:a.beforeSHA===b.beforeSHA,afterEqual:a.afterSHA===b.afterSHA,left:{before:a.beforeSHA,after:a.afterSHA,sums:a.sums,changed:a.changed},right:{before:b.beforeSHA,after:b.afterSHA,sums:b.sums,changed:b.changed}};
}
console.log(JSON.stringify(result,null,2));
