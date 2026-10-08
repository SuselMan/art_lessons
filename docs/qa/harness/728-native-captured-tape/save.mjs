import {readFile,writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
const input=JSON.parse(await readFile(process.argv[2],'utf8')),out=path.resolve(process.argv[3]??'temp/native-captured-images'),result=input.result??input
if(!result.images||!['nativeLayer','productionGlLayer','diff'].every(name=>name in result.images))throw new Error('Result has no complete image set')
await mkdir(out,{recursive:true})
for(const [name,png] of Object.entries(result.images??{})){if(typeof png!=='string'||!png.startsWith('data:image/png;base64,'))throw new Error('Invalid PNG result');await writeFile(path.join(out,name+'.png'),Buffer.from(png.slice('data:image/png;base64,'.length),'base64'))}
const {images,...metrics}=result;await writeFile(path.join(out,'metrics.json'),JSON.stringify(metrics,null,2));console.log(out)
