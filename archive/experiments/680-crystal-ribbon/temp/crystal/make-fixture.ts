import {readFileSync,writeFileSync} from 'node:fs';import {packDabs,strokeDabs} from '../../packages/shared/src/dabCodec';
const ops=JSON.parse(readFileSync('/home/suselman/projects/pencil-agents/680-device-qa-guards/temp/room-KJc0OoVo/ops.json','utf8'));const template=ops.find(o=>o.seq===47);const original=strokeDabs(template);const dabs=[];
for(let i=0;i<=720;i++){const theta=i/720*Math.PI*8,r=180-140*i/720,pressure=.5+.28*Math.sin(i/720*Math.PI*32);dabs.push({...original[20],x:700+Math.cos(theta)*r,y:700+Math.sin(theta)*r,pressure,size:80*(.3+.7*pressure),angle:0,aspectRatio:1.15,t:original[0].t+i*3});}
const op={...template,dabsPacked:packDabs(dabs)};delete op.wet;delete op.dabs;writeFileSync('temp/crystal/packed-fixture.json',JSON.stringify([op]));
