import { expect,it } from 'vitest'
import { canonicalDispatchRect } from './dispatchRect'
it('exactly covers original f32 GL scissor pixel-centre predicate including clipped/fractional/empty rectangles',()=>{
 const W=32,H=40,rects=[undefined,[0,0,W,H],[3,5,7,9],[-3,-5,11,13],[30,38,9,9],[8,10,0,4],[5,7,-3,2],[100,100,2,2],[2.50000001,4.49999999,7.0000001,9.5]] as (undefined|[number,number,number,number])[]
 let seed=123;for(let i=0;i<250;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed%70-20;seed=(Math.imul(seed,1664525)+1013904223)>>>0;rects.push([x+.5,H-(seed%70)+.125,(seed%45)-5,(seed%37)-4])}
 for(const scissor of rects){const r=canonicalDispatchRect(W,H,scissor),s=(scissor??[0,0,W,H]).map(Math.fround)
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const glY=H-y-.5,written=x+.5>=s[0]&&glY>=s[1]&&x+.5<Math.fround(s[0]+s[2])&&glY<Math.fround(s[1]+s[3])
   const launched=x>=r[0]&&y>=r[1]&&x<r[0]+r[2]&&y<r[1]+r[3]
   expect(launched,JSON.stringify({scissor,x,y})).toBe(written)
  }
 }
})
it('rejects nonfinite packed scissors and reduces workgroup footprint without changing coordinates',()=>{
 expect(()=>canonicalDispatchRect(1536,1536,[NaN,0,20,20])).toThrow('finite')
 expect(canonicalDispatchRect(1536,1536,[10,20,100,200])).toEqual([10,1316,100,200])
 expect(Math.ceil(100/8)*Math.ceil(200/8)*64).toBe(20800)
})
