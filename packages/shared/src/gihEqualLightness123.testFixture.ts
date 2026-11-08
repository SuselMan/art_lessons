import{brush121,dab121}from'./gihEqualRgba121.testFixture.js'
export{dab121 as dab123}
export const ids123=['1230','1231','1232','1233'].map(s=>`asset:${s.padEnd(64,'0')}`as const)
export const grays123=[ids123[1],ids123[2],ids123[3]]
export function brush123(mode:'xtilt'|'ytilt'|'angular'|'dimensions'='xtilt'){const b=brush121(mode);b.version=123;b.id='imported-232323232323232323232323';delete b.tip.color;b.tip.mask=ids123[0];b.tip.animation!.frames=[ids123[0],ids123[0],ids123[0]];b.tip.material={kind:'lightness',gray:grays123[0],grayFrames:[...grays123],strength:1};return b}
export const assets123=ids123.map(id=>({id,size:4,file:id.slice(6)+'.bin'}))
export function pixels123(id:string){const value=id===ids123[0]?255:id===ids123[1]?87:id===ids123[2]?127:39;return new Uint8Array([0,0,0,0,...Array<number>(8).fill(value),0,0,0,0])}
