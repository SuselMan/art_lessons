import {it,expect} from 'vitest'
import {buildRimHashCornerTable,rimHashOrderedF32,sampleRimHashCorner} from './rimHashCornerTable'
it('covers actual1536 two-octave domain with bounded exact F32 corner values',()=>{const t=buildRimHashCornerTable({width:1536,height:1536,world:[0,-1576,1]});expect(t.bytes).toBeLessThan(20000);for(const [x,y]of [[3,-4],[41,7],[31,-34],[82,17],[-1,-20]])expect(sampleRimHashCorner(t,x,y)).toBe(rimHashOrderedF32(x,y));const again=buildRimHashCornerTable({width:1536,height:1536,world:[0,-1576,1]});expect(new Uint32Array(again.values.buffer)).toEqual(new Uint32Array(t.values.buffer));expect(()=>sampleRimHashCorner(t,-100,0)).toThrow()})
it('rejects unbounded input and preserves finite normalized hash',()=>{expect(()=>rimHashOrderedF32(1.5,0)).toThrow();expect(()=>buildRimHashCornerTable({width:1536,height:1536,world:[0,0,100]})).toThrow();expect(()=>buildRimHashCornerTable({width:0,height:2,world:[0,0,1]})).toThrow();for(let x=-30;x<100;x++){const h=rimHashOrderedF32(x,7);expect(h).toBeGreaterThanOrEqual(0);expect(h).toBeLessThan(1)}})

import {rimHashSeededU32} from './rimHashCornerTable'
it('seeded corners are exact24bit, repeatable and reasonably distributed',()=>{
 const values=Array.from({length:4096},(_,i)=>rimHashSeededU32(i%64-32,Math.floor(i/64)-32,728))
 expect(values.every(v=>v>=0&&v<1&&Number.isInteger(v*16777216))).toBe(true)
 const mean=values.reduce((a,b)=>a+b,0)/values.length
 expect(mean).toBeGreaterThan(.47);expect(mean).toBeLessThan(.53)
 expect(rimHashSeededU32(-1,4,728)).toBe(rimHashSeededU32(-1,4,728))
 expect(rimHashSeededU32(-1,4,729)).not.toBe(rimHashSeededU32(-1,4,728))
})
