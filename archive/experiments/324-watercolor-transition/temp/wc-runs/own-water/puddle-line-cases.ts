import {readFileSync,writeFileSync} from 'node:fs'
import {strokeDabs} from '../../../packages/shared/src/dabCodec'
const groups=JSON.parse(readFileSync('temp/wc-runs/own-water/groups.json','utf8'))
const chosen=[331,333].map(seq=>groups.find(g=>g.seq===seq))
const ops=chosen.flatMap(g=>g.os.map(o=>{const ds=strokeDabs(o).map(d=>({...d,x:d.x-800,y:d.y-2100}));const {dabsPacked,...rest}=o;return {...rest,dabs:ds}}))
writeFileSync('temp/wc-runs/own-water/puddle-line-cases.json',JSON.stringify([{name:'puddle-control',ops},{name:'puddle-no-carry',ops,noCarry:true}]))
