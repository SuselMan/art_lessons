import {expect,it} from 'vitest'
import {MaterialFieldPages,type MaterialFieldSnapshot,type MaterialRect} from './MaterialFieldPages'

it('preserves arbitrary RGBA bytes through uniform pages, partial writes and immutable snapshots',()=>{
 let seed=781
 const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n}
 for(const pageSize of [1,3,7,512]){
  const width=17,height=11,field=new MaterialFieldPages({width,height,pageSize}),dense=new Uint8Array(width*height*4)
  const history:Array<{snapshot:MaterialFieldSnapshot;bytes:Uint8Array}>=[]
  const full={x:0,y:0,width,height}
  for(let step=0;step<180;step++){
   const rect:MaterialRect={x:random(width),y:random(height),width:0,height:0}
   rect.width=1+random(width-rect.x);rect.height=1+random(height-rect.y)
   // Deliberately unaligned input storage: only the field owns word-aligned pages.
   const data=new Uint8Array(rect.width*rect.height*4+1).subarray(1),rgba=[random(256),random(256),random(256),random(256)]
   for(let i=0;i<data.length;i++)data[i]=step%5===0?0:step%3===0?rgba[i%4]!:random(256)
   for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++)for(let c=0;c<4;c++)dense[((rect.y+y)*width+rect.x+x)*4+c]=data[(y*rect.width+x)*4+c]!
   field.writeRect(rect,data)
   expect(field.snapshot().readRect(full)).toEqual(dense)
   if(step%45===0)history.push({snapshot:field.snapshot(),bytes:dense.slice()})
  }
  for(const old of history)expect(old.snapshot.readRect(full)).toEqual(old.bytes)
 }
})

it('preserves uniform nonzero channels at clamped edges and zero boundaries',()=>{
 for(const rgba of [[1,2,3,4],[255,128,64,0],[0,0,0,255],[255,255,255,255]]){
  const field=new MaterialFieldPages({width:3,height:2,pageSize:2}),data=new Uint8Array(24)
  for(let i=0;i<data.length;i++)data[i]=rgba[i%4]!
  field.writeRect({x:0,y:0,width:3,height:2},data)
  const rect={x:-1,y:-1,width:5,height:4},clamp=field.snapshot().readRect(rect),zero=field.snapshot().readRect(rect,'zero')
  for(let y=0;y<4;y++)for(let x=0;x<5;x++)for(let c=0;c<4;c++){
   expect(clamp[(y*5+x)*4+c]).toBe(rgba[c])
   expect(zero[(y*5+x)*4+c]).toBe(x>0&&x<4&&y>0&&y<3?rgba[c]:0)
  }
 }
})
