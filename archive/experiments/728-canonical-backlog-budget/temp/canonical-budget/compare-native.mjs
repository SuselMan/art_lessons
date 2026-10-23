import fs from 'node:fs'
import {createRequire} from 'node:module'
const req=createRequire('/home/suselman/projects/pencil-agents/680-device-qa-guards/package.json'),sharp=req('sharp')
const dir=process.argv[2],report=JSON.parse(fs.readFileSync(dir+'/report.json')),comparisons=[]
for(const c of report.cases)for(const [first,second]of [['nativeDry','redo'],['pigmentDry','pigmentRedo']]){
 const a=await sharp(dir+'/'+c.key+'-'+first+'.png').ensureAlpha().raw().toBuffer(),b=await sharp(dir+'/'+c.key+'-'+second+'.png').ensureAlpha().raw().toBuffer()
 if(a.length!==b.length)throw Error('dimensions');let changed=0,max=0
 for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);changed+=d!==0;max=Math.max(max,d)}
 comparisons.push({arm:c.key,comparison:first+'/'+second,bytes:a.length,changed,max})
}
fs.writeFileSync(dir+'/rgba-comparison.json',JSON.stringify(comparisons,null,2));console.log(JSON.stringify(comparisons))
