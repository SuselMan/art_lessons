import fs from 'node:fs'
import { createRequire } from 'node:module'
const require=createRequire('/home/suselman/projects/pencil-agents/680-device-qa-guards/package.json'),sharp=require('sharp')
const dir=process.argv[2],r=JSON.parse(fs.readFileSync(dir+'/report.json')),c=r.cases[0],pc=c.pageCoordinates
const pair=await Promise.all(['beforeDry','afterDry'].map(n=>sharp(dir+'/PIGMENT_BASE-'+n+'-screen.png').ensureAlpha().raw().toBuffer({resolveWithObject:true})))
if(pair[0].info.width!==pair[1].info.width||pair[0].info.height!==pair[1].info.height)throw Error('screen dimensions changed')
const sx=pair[0].info.width/pc.viewport[0],sy=sx,out={scope:'actual screen before/after ordered Dry, separate camera-mapped ROI; screen comparison not material oracle',dimensions:pair[0].info,toneSource:c.toneSource,rois:{}}
for(const key of ['bare','painted','control']){
  const pts=pc.css[key],center=pts[0].map((v,i)=>(v+pts[1][i])/2),rect={left:Math.round(center[0]*sx)-12,top:Math.round(center[1]*sy)-6,width:24,height:12};let count=0,max=0,sum=[0,0,0],a=[0,0,0],b=[0,0,0]
  for(let y=rect.top;y<rect.top+rect.height;y++)for(let x=rect.left;x<rect.left+rect.width;x++){const p=(y*pair[0].info.width+x)*4;let changed=false;for(let k=0;k<3;k++){const d=pair[0].data[p+k]-pair[1].data[p+k];sum[k]+=d;a[k]+=pair[0].data[p+k];b[k]+=pair[1].data[p+k];max=Math.max(max,Math.abs(d));changed||=d!==0}count+=changed}
  const n=rect.width*rect.height;out.rois[key]={rect,pixels:n,changed:count,max,meanWet:a.map(v=>v/n),meanDry:b.map(v=>v/n),signedWetMinusDry:sum.map(v=>v/n)}
  await Promise.all(['beforeDry','afterDry'].map(n=>sharp(dir+'/PIGMENT_BASE-'+n+'-screen.png').extract(rect).resize(240,120,{kernel:'nearest'}).png().toFile(dir+'/'+key+'-'+n+'-crop.png')))
}
fs.writeFileSync(dir+'/screen-roi-comparison.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out))
