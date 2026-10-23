import sharp from 'sharp';import {writeFile} from 'node:fs/promises';
const root='/home/suselman/projects/pencil-agents/680-water-wet-tone/temp/fast-watercolor-night/captured-water-pigment';const out={};
for(const name of ['nativeLayer','productionGlLayer']){
 const {data,info}=await sharp(root+'/'+name+'.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const sample=(x,y)=>[...data.subarray((y*info.width+x)*4,(y*info.width+x+1)*4)];let nonzero=0,hiddenRGB=0,loAlphaRgb=0,alphaMax=0,bbox=[info.width,info.height,0,0];const rows=[];
 for(let y=0;y<info.height;y++){let x0=info.width,x1=0,count=0,amax=0;for(let x=0;x<info.width;x++){const i=(y*info.width+x)*4,a=data[i+3];alphaMax=Math.max(alphaMax,a);if(a===0&&data[i]+data[i+1]+data[i+2]>0)hiddenRGB++;if(a>0){nonzero++;x0=Math.min(x0,x);x1=Math.max(x1,x);count++;amax=Math.max(amax,a);bbox=[Math.min(bbox[0],x),Math.min(bbox[1],y),Math.max(bbox[2],x),Math.max(bbox[3],y)];if(a<=4&&Math.max(data[i],data[i+1],data[i+2])>200)loAlphaRgb++;}}if(count)rows.push({y,x0,x1,count,amax});}
 out[name]={info,nonzero,hiddenRGB,loAlphaRgb,alphaMax,bbox,samples:[[500,560],[500,531],[500,532],[440,531],[440,532],[500,510]].map(([x,y])=>({x,y,rgba:sample(x,y)})),rows:rows.filter(r=>r.y>=525&&r.y<=537)};
}
await writeFile('temp/png-review/metrics.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
