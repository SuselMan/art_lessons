import fs from 'node:fs'
import {strokeDabs} from '../../packages/shared/src/index'
const source=JSON.parse(fs.readFileSync('/home/suselman/projects/pencil-agents/680-water-wet-tone/temp/fast-watercolor-night/native-coverage-linear-surface-1791422250467.json','utf8'))
const result=[]
for(const op of source.tape){if(op.type!=='stroke')continue;const d=strokeDabs(op);const candidates=d.map((v:any,i:number)=>({i,x:v.x,y:v.y,size:v.size,angle:v.angle,pressure:v.pressure,distance:Math.hypot(v.x-572,v.y-435)})).filter((v:any)=>v.distance<v.size*.5+5);result.push({id:op.id,dabs:d.length,candidates})}
fs.writeFileSync('temp/native-source-offline/near-pressure-site.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result.map(x=>({id:x.id,dabs:x.dabs,candidates:x.candidates.length}))))
