import {readFileSync,writeFileSync} from 'node:fs'
import {strokeDabs} from '../../../packages/shared/src/dabCodec'
const groups=JSON.parse(readFileSync('temp/wc-runs/own-water/groups.json','utf8'))
const chosen=[133,134,54].map(seq=>groups.find(g=>g.seq===seq)).filter(Boolean)
const cases=chosen.map(g=>{const dx=140-g.box[0],dy=250-g.box[1];const ops=g.os.map(o=>{const ds=strokeDabs(o).map(d=>({...d,x:d.x+dx,y:d.y+dy}));const {dabsPacked,...rest}=o;return {...rest,dabs:ds}});console.log({seq:g.seq,preset:g.preset,dabKeys:Object.keys(ops[0].dabs[0]),wet:ops[0].dabs.slice(0,3).map(d=>d.wet),size:ops[0].dabs[0].size});return {name:'room-'+g.seq,ops}})
writeFileSync('temp/wc-runs/own-water/cases.json',JSON.stringify(cases))
