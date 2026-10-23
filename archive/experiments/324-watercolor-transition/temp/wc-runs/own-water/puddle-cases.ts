import {readFileSync,writeFileSync} from 'node:fs'
import {strokeDabs} from '../../../packages/shared/src/dabCodec'
const groups=JSON.parse(readFileSync('temp/wc-runs/own-water/groups.json','utf8'))
const chosen=[316,317,318].map(seq=>groups.find(g=>g.seq===seq))
const ops=chosen.flatMap(g=>g.os.map(o=>{const ds=strokeDabs(o).map(d=>({...d,x:d.x-1100,y:d.y-1000}));const {dabsPacked,...rest}=o;return {...rest,dabs:ds}}))
writeFileSync('temp/wc-runs/own-water/puddle-cases.json',JSON.stringify([{name:'puddle-control',ops},{name:'puddle-no-carry',ops,noCarry:true}]))
