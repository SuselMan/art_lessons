import type{AssetId}from'./brushes.js'
import{library174,sketch174,left174,right174,alpha174}from'./sketchGih174.testFixture.js'
export{left174,right174,alpha174}
export const centre181:AssetId='asset:1810000000000000000000000000000000000000000000000000000000000001'
export const alpha181=()=>Uint8Array.from({length:16},(_,i)=>i%4===1?255:0)
export function sketch181(){const b=sketch174();b.id='imported-181181181181181181181181';b.version=181;b.tip.animation={mode:'pressure',rank:3,frames:[left174,centre181,right174]};return b}
export function library181(){const l=library174();l.brushes[0].descriptor=sketch181();l.assets.push({id:centre181,file:centre181.slice(6)+'.bin',size:4});return l}
