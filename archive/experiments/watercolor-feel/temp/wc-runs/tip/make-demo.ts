import {readFileSync,writeFileSync} from 'node:fs'
import {packDabs,unpackDabs} from '../../../packages/shared/src/dabCodec'
const ops=JSON.parse(readFileSync('temp/strokes-app/ops_91gFLNh2.json','utf8'))
const first=ops.find((o:{type:string})=>o.type==='stroke')
const template=unpackDabs(first.dabsPacked)[0]
const demo=[0,1,2].map(row=>({...first,id:'demo-'+row,strokeId:'demo-'+row,washId:'wash-'+row,timestamp:first.timestamp+row*120000,dabsPacked:packDabs(Array.from({length:161},(_,i)=>({...template,x:350+i*6,y:400+row*300,pressure:row===0?0.8:Math.max(0,0.8*(1-Math.max(0,i-110)/50)),size:130,aspectRatio:1,angle:0,opacity:template.opacity,t:template.t+i*12}))),wet:undefined}))
writeFileSync('temp/wc-runs/tip/demo-ops.json',JSON.stringify(demo))
