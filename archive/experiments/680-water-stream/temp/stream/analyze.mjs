import{readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';
const p=process.argv[2], rows=JSON.parse(readFileSync(join(p,'report.json'))),out=[];
for(const row of rows){const fields={};for(const[name,f]of Object.entries(row.fields)){const a=readFileSync(join(p,row.variant+'-'+name+'.rgba'));const sums=[0,0,0,0];for(let i=0;i<a.length;i++)sums[i%4]+=a[i];fields[name]={sums,sha:f.sha,w:f.w,h:f.h}}
const pigment=(row.trace??[]).filter(x=>x.dose>0);out.push({name:row.variant,gl:row.gl,lost:row.lost,fields,sourceStampDoseDescriptor: pigment.reduce((a,x)=>a+x.dose,0),pigmentDabs:pigment.length,pigmentTrace:pigment})}
writeFileSync(join(p,'metrics.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out.map(({pigmentTrace,...x})=>x),null,2));
