import{brush123,dab123}from'./gihEqualLightness123.testFixture.js'
export{dab123 as dab124}
export const dimensions124=[[4,2],[8,6],[2,4]]as const
export const alpha124=['1240','1241','1242'].map(s=>`asset:${s.padEnd(64,'0')}`as const)
export const gray124=['124a','124b','124c'].map(s=>`asset:${s.padEnd(64,'0')}`as const)
export const assets124=[...alpha124,...gray124].map((id,index)=>({id,size:index%3===1?8:4,file:id.slice(6)+'.bin'}))
export function brush124(mode:'xtilt'|'ytilt'|'angular'|'dimensions'='xtilt'){
 const b=brush123(mode);b.id='imported-242424242424242424242424';b.version=124;b.tip.mask=alpha124[0];b.tip.maskBounds={x:0,y:0,width:1,height:1};b.tip.animation!.frames=[...alpha124];b.tip.animation!.geometry={version:1,frames:dimensions124.map(([sourceWidth,sourceHeight])=>({sourceWidth,sourceHeight,maskBounds:{x:0,y:0,width:1,height:1}}))};b.tip.material={kind:'lightness',gray:gray124[0],grayFrames:[...gray124],strength:1};return b
}
export function pixels124(id:string):Uint8Array{
 const index=alpha124.indexOf(id as (typeof alpha124)[number]),grayIndex=gray124.indexOf(id as (typeof gray124)[number]),i=index<0?grayIndex:index;if(i<0)throw Error('Unknown124 source');const[w,h]=dimensions124[i],side=i===1?8:4,value=index<0?[87,127,39][i]:i===1?128:255,raw=new Uint8Array(side*side),left=(side-w)/2,top=(side-h)/2;for(let y=0;y<h;y++)raw.fill(value,(y+top)*side+left,(y+top)*side+left+w);return raw
}
