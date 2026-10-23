import {readFileSync,writeFileSync} from 'node:fs'
import {strokeDabs} from '../../../packages/shared/src/dabCodec'
const ops=JSON.parse(readFileSync('temp/wc-runs/own-water/ops.json','utf8'))
const groups=new Map<string,any[]>()
for(const o of ops)if(o.tool==='watercolor'){const key=o.strokeId??o.id;groups.set(key,[...(groups.get(key)??[]),o])}
const rows=[...groups].map(([id,os])=>{const ds=os.flatMap(strokeDabs);const x=ds.map(d=>d.x),y=ds.map(d=>d.y);let distance=0;for(let i=1;i<ds.length;i++)distance+=Math.hypot(ds[i].x-ds[i-1].x,ds[i].y-ds[i-1].y);const end=Math.hypot(ds.at(-1).x-ds[0].x,ds.at(-1).y-ds[0].y);return {id,os,dabs:ds.length,preset:os[0].preset,seq:os[0].seq,box:[Math.min(...x),Math.min(...y),Math.max(...x),Math.max(...y)],ratio:distance/Math.max(1,end)}})
writeFileSync('temp/wc-runs/own-water/groups.json',JSON.stringify(rows))
console.log(rows.filter(r=>r.preset.startsWith('normal:100:')&&r.ratio<1.35&&r.dabs>8).slice(0,12).map(({os,...r})=>r))
