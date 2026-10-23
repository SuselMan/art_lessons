import { readFileSync, writeFileSync } from 'node:fs'
import { brushDragContacts } from '../../apps/web/src/engine/src/watercolor/brushDrag'
const cases=JSON.parse(readFileSync('temp/spiral/cases.json','utf8'))
const out=[]
for(const shape of ['spiral','blob']) {
 const op=cases.find((x:any)=>x.name===shape+'-baseline').ops[1]
 const travel=op.dabs.slice(1).map((d:any,i:number)=>({x:d.x,y:d.y,radius:d.size*.5,aspect:Math.max(1,d.aspectRatio),angle:d.angle,dx:d.x-op.dabs[i].x,dy:d.y-op.dabs[i].y,water:1}))
 const contacts=brushDragContacts(travel,{x:0,y:0,w:1536,h:1536})
 out.push({shape,contacts:contacts.map(c=>({...c,field:{...c.field,pixels:Array.from(c.field.pixels)}}))})
 console.log(shape,contacts.length)
}
writeFileSync('temp/spiral/brush-contacts.json',JSON.stringify(out))
