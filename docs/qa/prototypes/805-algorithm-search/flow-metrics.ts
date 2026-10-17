import type {AlgorithmInput} from './protocol'
/** Functional tracer metrics. Run after full readback, outside timed GPU interval.
 * Red/blue optical carriers identify separate deposits ONLY in flow-* canaries.
 * Alpha is a bounded carrier proxy, not physical pigment mass. */
export function flowMetrics(id:string,input:AlgorithmInput,out:Uint8Array){
 if(!id.startsWith('flow-'))return undefined
 const n=input.size,scale=1024/n
 let initialR=0,initialB=0,total=0,far25=0,far50=0,far100=0,blueCross=0,yellowCross=0,mixed=0,dry=0,initialMixed=0,outputR=0,outputB=0
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const i=y*n+x,p=i*4,X=x*scale,Y=y*scale,a=out[p+3],r=out[p],b=out[p+2]
  initialR+=input.rgba[p];initialB+=input.rgba[p+2];outputR+=r;outputB+=b;total+=a
  const d=(id==='flow-pool-drop'||id==='flow-paper-drop')?Math.max(0,Math.hypot(X-512,Y-512)-26):Math.max(0,Math.min(Math.hypot(X-(id==='flow-near-colors'?472:392),Y-512),Math.hypot(X-(id==='flow-near-colors'?552:632),Y-512))-26)
  if(d>=25)far25+=a;if(d>=50)far50+=a;if(d>=100)far100+=a
  const onRight=id==='flow-diagonal-wall'?X+Y>=1024:X>=512
  if(id==='flow-one-pixel-wall'?X>513:onRight)blueCross+=r;if(id==='flow-one-pixel-wall'?X<513:!onRight)yellowCross+=b
  if(r>=2&&b>=2)mixed+=Math.min(r,b)
  if(input.rgba[p]>=2&&input.rgba[p+2]>=2)initialMixed++
  if(input.water[i]===0&&(r!==input.rgba[p]||b!==input.rgba[p+2]||out[p+1]!==input.rgba[p+1]||a!==input.rgba[p+3]))dry++
 }
 const fraction=(v:number,t:number)=>t?v/t:0
 return{schemaVersion:2,scope:'Synthetic fixed wet-domain canaries; not artistic acceptance or physical mass',initialMixedPixels:initialMixed,alphaCarrier:total,massBeyond25px:fraction(far25,total),massBeyond50px:fraction(far50,total),massBeyond100px:fraction(far100,total),blueCrossFraction:fraction(blueCross,initialR),yellowCrossFraction:fraction(yellowCross,initialB),mixedCarrierFraction:fraction(mixed,Math.min(initialR,initialB)),redMassRatio:fraction(outputR,initialR),blueMassRatio:fraction(outputB,initialB),changedDryPixels:dry}
}
