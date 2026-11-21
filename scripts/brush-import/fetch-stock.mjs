import {readFile, mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../../',import.meta.url)),pin=JSON.parse(await readFile(new URL('./stock-catalog.json',import.meta.url),'utf8'))
const archive=fileURLToPath(new URL(`./resources/${pin.filename}`,import.meta.url)),bytes=await readFile(archive)
if(bytes.length!==pin.bytes||createHash('sha256').update(bytes).digest('hex')!==pin.sha256)throw Error('Stock catalog checksum mismatch')
const target=path.join(root,'apps/server/resources/brush-stock');await mkdir(target,{recursive:true})
execFileSync('tar',['-xzf',archive,'-C',target])
console.log(`Verified stock catalog: ${pin.brushCount} brush presets`)
