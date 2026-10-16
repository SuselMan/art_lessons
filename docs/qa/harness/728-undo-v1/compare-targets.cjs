const fs=require('node:fs'),path=require('node:path');
const [left,right,out]=process.argv.slice(2);if(!left||!right||!out)throw Error('Arguments left-directory right-directory output.json required');
const a=JSON.parse(fs.readFileSync(path.join(left,'final-targets.json'))),b=JSON.parse(fs.readFileSync(path.join(right,'final-targets.json')));if(a.room!==b.room)throw Error('Different fixtures');
const report={room:a.room,renderers:[a.renderer,b.renderer],layers:[]};
for(const target of a.targets){const other=b.targets.find(t=>t.id===target.id);const row={layer:target.id,name:target.name,equal:!!other&&target.hash===other.hash,bytes:[target.bytes,other?.bytes]};
 const lp=path.join(left,target.id+'.bin'),rp=path.join(right,target.id+'.bin');if(fs.existsSync(lp)&&fs.existsSync(rp)){const l=fs.readFileSync(lp),r=fs.readFileSync(rp);let changed=0,sum=0,max=0,over1=0,over4=0,over16=0;for(let i=20;i<Math.max(l.length,r.length);i++){const d=Math.abs((l[i]??0)-(r[i]??0));sum+=d;if(d)changed++;if(d>1)over1++;if(d>4)over4++;if(d>16)over16++;max=Math.max(max,d)}row.diff={changed,max,over1,over4,over16,mean:sum/Math.max(1,Math.max(l.length,r.length)-20)}}report.layers.push(row)}
report.equal=report.layers.every(t=>t.equal)&&a.targets.length===b.targets.length;fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.equal)process.exitCode=1;
