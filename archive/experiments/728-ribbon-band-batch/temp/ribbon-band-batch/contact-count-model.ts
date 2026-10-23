import fs from 'node:fs';
import {unpackDabs} from '../../../../pencil/packages/shared/src/dabCodec';
import {brushDragContactGroups,brushDragField,brushDragMaxExposure} from '../../apps/web/src/engine/src/watercolor/brushDrag';
const ordinary=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).cases[0];
const result=[];
for(const item of ordinary.nativeDry.journal.filter((x:any)=>x.op.type==='stroke')){
 const dabs=unpackDabs(item.op.dabsPacked),travel=dabs.slice(1).map((d,i)=>({x:d.x,y:d.y,radius:d.size*.5,settleRadius:Math.fround(d.size)*.5,aspect:Math.max(1,d.aspectRatio),angle:d.angle,dx:d.x-dabs[i].x,dy:d.y-dabs[i].y,water:1})).filter(d=>Math.hypot(d.dx,d.dy)>.01);
 const rect={x:0,y:0,w:1754,h:2480},groups=brushDragContactGroups(travel,rect);let rasterCells=0;
 const contacts=groups.map(g=>{const f=brushDragField(g.travel,g.rect)!;rasterCells+=f.width*f.height;const exposure=brushDragMaxExposure(f.pixels);return{radius:g.radius,width:f.width,height:f.height,travel:g.travel.length,exposure,pulsesS1:Math.max(1,Math.ceil(.2*g.radius*exposure*Math.SQRT2/.84)),pulsesS2:Math.max(1,Math.ceil(.2*g.radius/2*exposure*Math.SQRT2/.84))}});
 result.push({seq:item.serverSeq,dabs:dabs.length,groups:groups.length,rasterCells,pulsesS1:contacts.reduce((s,c)=>s+c.pulsesS1,0),pulsesS2:contacts.reduce((s,c)=>s+c.pulsesS2,0),uploads:groups.length,contacts});
}
console.log(JSON.stringify({scope:'CPU reconstruction from float32 recorded dabs; actual native brushTravel doubles and actual cropped field geometry were not captured. Rect fixed sheet1754x2480; not exact actual op count proof.',result}));
