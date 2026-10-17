// Exact rational reference for the first 512→256 ContrastPhase background blur.
// Diagnostic only: this defines ideal sample coordinates and half-up UNORM8,
// and does not silently substitute either rule into the product renderer.
const fs=require('fs');const[sourcePath,...readbacks]=process.argv.slice(2);if(!sourcePath)throw Error('Usage: source.json [gpu-bg.rgba...]');
const source=JSON.parse(fs.readFileSync(sourcePath)),input=source.buffers.inkColor;
if(input.width!==512||input.height!==512)throw Error('Only original 512² source is supported');
const bytes=Buffer.from(input.base64,'base64'),width=256,height=256,candidates=Array.from({length:4},()=>Buffer.alloc(width*height*4)),expected=candidates[0],tieIndices=[];
for(let candidate=0;candidate<4;candidate++){
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 let weight=0;const sums=[0,0,0,0];
 for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
  // uv=(glFragCoord/256)+offset*24/512: multiplying by512 is exact here.
  const sx=2*x+1+dx*24,sy=2*y+1+dy*24;if(sx<0||sy<0||sx>512||sy>512)continue;
  const w=(3-Math.abs(dx))*(3-Math.abs(dy)),at=((sy-(candidate>>1))*512+sx-(candidate&1))*4;weight+=w;
  for(let c=0;c<4;c++)sums[c]+=bytes[at+c]*w;
 }
 for(let c=0;c<4;c++){
  const sum=sums[c],denominator=255*weight+sum,numerator=255*sum,at=(y*width+x)*4+c;
  // All integers stay below 2^53; direct quotient comparison is exact.
  const q=Math.floor(numerator/denominator),remainder=numerator-q*denominator;
  candidates[candidate][at]=q+(2*remainder>=denominator?1:0);if(candidate===0&&2*remainder===denominator)tieIndices.push(at);
 }
}
}
const result={addressCandidates:['ideal-floor','x-below-boundary','y-below-boundary','xy-below-boundary'],scope:'Ideal exact-rational shader with ideal UV/NEAREST addressing; half-up tie choice is explicit, not a production oracle',width,height,exactHalfTies:tieIndices.length,readbacks:[]};
for(const path of readbacks){const actual=fs.readFileSync(path);if(actual.length!==expected.length)throw Error('Wrong readback size');let changed=0,maxDiff=0,tieDiff=0;const examples=[];for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i]){changed++;maxDiff=Math.max(maxDiff,Math.abs(actual[i]-expected[i]));if(tieIndices.includes(i))tieDiff++;if(examples.length<12)examples.push({x:Math.floor(i/4)%width,y:Math.floor(i/4/width),channel:i%4,actual:actual[i],idealHalfUp:expected[i]})}let explainedPixels=0,unexplainedPixels=0;const matches=[0,0,0,0];for(let i=0;i<actual.length;i+=4){let explained=false;for(let k=0;k<candidates.length;k++)if([0,1,2,3].every(c=>actual[i+c]===candidates[k][i+c])){matches[k]++;explained=true}if(explained)explainedPixels++;else unexplainedPixels++}result.readbacks.push({path,changed,maxDiff,tieDiff,addressCandidatePixelMatches:matches,explainedPixels,unexplainedPixels,examples})}
console.log(JSON.stringify(result,null,2));
