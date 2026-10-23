import fs from 'node:fs'
import { strokeDabs } from '../../packages/shared/src/dabCodec'
import { brushDragContacts } from '../../apps/web/src/engine/src/watercolor/brushDrag'
const actual=JSON.parse(fs.readFileSync('/home/suselman/projects/pencil-agents/324-preview-isolation/temp/policy/source-ab-canonical/report.json','utf8'))
const dabs=strokeDabs(actual.ops[0]),travel=dabs.flatMap((d,i)=>{const p=dabs[i-1],dx=p?d.x-p.x:0,dy=p?d.y-p.y:0;return Math.hypot(dx,dy)>.01?[{x:d.x,y:d.y,radius:d.size*.5,aspect:Math.max(1,d.aspectRatio),angle:d.angle,dx,dy,water:1}]:[]})
const contacts=brushDragContacts(travel,{x:0,y:0,w:517,h:387})
const cpu=JSON.parse(fs.readFileSync('temp/parity/cpu-probe.json','utf8'))[1]
const out={actualDabs:dabs.length,actualTravel:travel.length,actualContacts:contacts.length,cpuReplayTravel:cpu.travel.length,cpuReplayContacts:cpu.contacts.length,contactsSame:contacts.length===cpu.contacts.length&&contacts.every((c,i)=>JSON.stringify(c.rect)===JSON.stringify(cpu.contacts[i].rect)&&c.radius===cpu.contacts[i].radius&&JSON.stringify([...c.field.pixels])===JSON.stringify(cpu.contacts[i].pixels))}
fs.writeFileSync('temp/parity/actual-packed-contact-check.json',JSON.stringify(out,null,2));console.log(out)
