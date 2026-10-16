import {expect,it} from 'vitest'
import {retainedComponents} from './retainedComponents'
function image(width:number,height:number,points:Array<[number,number,number]>){const out=new Uint8Array(width*height*4);for(const[x,y,q]of points)out[(y*width+x)*4]=q;return out}
for(const[width,height]of [[3,7],[7,3]])it(`filters ${width}x${height} without wrapping row edges`,()=>{
 const input=image(width,height,[[width-1,0,70],[0,1,80],[1,2,90]])
 const out=retainedComponents(input,width,height,2)
 expect(out[(width-1)*4]).toBe(0)
 expect(out[(width+0)*4]).toBe(80)
 expect(out[(2*width+1)*4]).toBe(90)
 expect(out[(2*width+1)*4+3]).toBe(90)
})
it('applies the exact component area threshold and preserves low values only when disabled',()=>{
 const input=image(4,2,[[0,0,5],[2,0,120],[3,1,121]])
 expect(retainedComponents(input,4,2,3).every(v=>v===0)).toBe(true)
 expect(retainedComponents(input,4,2,2)[2*4]).toBe(120)
 expect(retainedComponents(input,4,2,0)[0]).toBe(5)
})
