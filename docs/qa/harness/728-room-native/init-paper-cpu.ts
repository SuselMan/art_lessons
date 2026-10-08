import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {performance} from 'node:perf_hooks'
import {buildPaperCatch} from '../../../../apps/web/src/engine/src/paper/paperCatch'
import {expandCanonicalPaperLa} from '../../../../apps/web/src/engine/src/webgpuCanonical/paperExpansion'
const dir=process.argv[2]
if(!dir)throw new Error('Pass existing frozen public/paper directory; no assets are copied')
const manifest=JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8'))
const entry=manifest.assets.fine,height=gunzipSync(readFileSync(join(dir,entry.texture)))
const la=buildPaperCatch(height,entry.catchLut)
const old=()=>{const out=new Uint8Array(la.length*2);for(let i=0;i<la.length/2;i++)out.set([la[i*2],la[i*2],la[i*2],la[i*2+1]],i*4);return out}
const runs=[]
for(const [name,fn] of [['old',old],['indexed',()=>expandCanonicalPaperLa(la)],['indexed',()=>expandCanonicalPaperLa(la)],['old',old]] as const){const t=performance.now(),out=fn();runs.push({name,wallMs:performance.now()-t,sha256:createHash('sha256').update(out).digest('hex')})}
console.log(JSON.stringify({scope:'VPS CPU, actual frozen Fine height + production buildPaperCatch, not GPU/RAM peak',asset:entry.texture,resolution:Math.sqrt(height.length),heightSha256:createHash('sha256').update(height).digest('hex'),laSha256:createHash('sha256').update(la).digest('hex'),inputBytes:la.length,outputBytes:la.length*2,oldPerTexelTemporaryArrays:height.length,runs,exactHash:runs.every(r=>r.sha256===runs[0].sha256)},null,2))
