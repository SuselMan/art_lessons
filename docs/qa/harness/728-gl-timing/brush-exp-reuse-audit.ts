import { brushDragField } from '../../../../apps/web/src/engine/src/watercolor/brushDrag'
const original=Math.exp
const rows=[]
for(const kind of ['grid-aligned','subpixel','varied-pressure'] as const){
 const travel=Array.from({length:12},(_,i)=>({x:200+i*4+(kind==='subpixel'?i*.013:0),y:200+i*4,radius:kind==='varied-pressure'?200+i*.013:200,aspect:1.3,angle:.73,dx:i%2?-8:8,dy:3,water:.8}))
 const values=new Map<string,number>(),bits=new Float64Array(1),bytes=new Uint8Array(bits.buffer)
 let calls=0
 try{
  Math.exp=(value:number)=>{calls++;bits[0]=value;const key=Array.from(bytes).join(',');values.set(key,(values.get(key)??0)+1);return original(value)}
  brushDragField(travel,{x:0,y:0,w:512,h:512})
 }finally{Math.exp=original}
 rows.push({kind,calls,uniqueExactArgs:values.size,repeatedCalls:calls-values.size,scope:'synthetic CPU exact argument census, not recorded production workload'})
}
console.log(JSON.stringify(rows,null,2))
