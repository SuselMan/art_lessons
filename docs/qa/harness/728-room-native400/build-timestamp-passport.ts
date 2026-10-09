import {frontFilmHoistShader} from '../../../../apps/web/src/engine/src/webgpuCanonical/passes/frontFilmHoist'
/** Offline current-source preparation only: no server/device/process launch or bake. */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {sourcePipelinePassport,sourceShort400RequiredKeys} from '../728-room-native-cpu-profile/source-precompile-passport'
import {CANONICAL_WATER_FRONT_WGSL,CANONICAL_CACHED_WATER_FRONT_WGSL,CANONICAL_DIFFUSE_WGSL,CANONICAL_FACTOR_CACHED_WATER_FRONT_WGSL} from '../../../../apps/web/src/engine/src/webgpuCanonical/passes/kernels'
import {buildPaperCatch} from '../../../../apps/web/src/engine/src/paper/paperCatch'
const [rawOut,rawOrigin,rawPaper]=process.argv.slice(2),runtime=fileURLToPath(new URL('../../../../',import.meta.url))
if(!rawOut||!rawOrigin||!rawPaper)throw Error('Explicit registered output, trusted HTTPS origin and existing paper directory required')
const out=path.resolve(rawOut),origin=new URL(rawOrigin)
if(origin.protocol!=='https:'||origin.origin!==rawOrigin||origin.username||origin.password)throw Error('Exact trusted HTTPS origin required')
const marker=JSON.parse(fs.readFileSync(path.join(out,'.codex-qa-disposable.json'),'utf8')),registry=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/codex-qa/resources.json'),'utf8'))
if(marker.path!==out||registry[marker.id]?.path!==out||registry[marker.id]?.nonce!==marker.nonce||fs.realpathSync(out)!==out)throw Error('Registered disposable ownership differs')
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:runtime,encoding:'utf8'}).trim())throw Error('Current runtime must be committed before passport')
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:runtime,encoding:'utf8'}).trim(),sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex')
const files=execFileSync('git',['ls-files','apps/web/src/engine','packages/shared/src','apps/web/src/pages/Room/diagnostics/watercolorQaOptions.ts'],{cwd:runtime,encoding:'utf8'}).trim().split('\n').map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(runtime,p)))}))
const paper=path.resolve(rawPaper),paperFiles=fs.readdirSync(paper).filter(p=>fs.statSync(path.join(paper,p)).isFile()).map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(paper,p)))}))
const baked=JSON.parse(fs.readFileSync(path.join(paper,'manifest.json'),'utf8')),fine=baked.assets.fine
if(typeof fine.texture!=='string'||path.basename(fine.texture)!==fine.texture)throw Error('Fine paper filename invalid')
const height=new Uint8Array(gunzipSync(fs.readFileSync(path.join(paper,fine.texture))))
if(height.length!==2048*2048)throw Error('Production Fine2048 height required')
const paperLaSha256=sha(buildPaperCatch(height,fine.catchLut))
const lattice=Buffer.from(fs.readFileSync(path.join(runtime,'apps/web/src/engine/src/raster/watercolorNoise.txt'),'utf8'),'base64'),rgba=new Uint8Array(lattice.length*4)
if(lattice.length!==251*251)throw Error('Exact production lattice required');for(let k=0;k<lattice.length;k++)rgba.set([lattice[k],lattice[k],lattice[k],255],k*4)
const noiseRgbaSha256=sha(rgba)
const write=(name:string,value:unknown)=>{const dest=path.join(out,name);if(fs.existsSync(dest)||fs.existsSync(dest+'.tmp'))throw Error('Refuse overwrite passport');fs.writeFileSync(dest+'.tmp',typeof value==='string'?value:JSON.stringify(value),{mode:0o600,flag:'wx'});fs.renameSync(dest+'.tmp',dest)}
write('source-manifest.json',{head,files});write('paper-manifest.json',{files:paperFiles,sourceReuse:'current existing baked paper; no copy/bake'});write('origin-manifest.json',{head,origin:origin.origin,sourceOrigin:origin.origin,paperLaSha256,noiseRgbaSha256,sourcePipelinePassport:sourcePipelinePassport(),sourceRequiredKeys:sourceShort400RequiredKeys,factorShaderSHA:sha(CANONICAL_FACTOR_CACHED_WATER_FRONT_WGSL),filmShaderSHAs:{plain:sha(frontFilmHoistShader(CANONICAL_WATER_FRONT_WGSL,true)),cached:sha(frontFilmHoistShader(CANONICAL_CACHED_WATER_FRONT_WGSL,true))},observedShaderSHAs:[CANONICAL_WATER_FRONT_WGSL,CANONICAL_DIFFUSE_WGSL].map(sha)});write('entry',origin.origin+'/create')
console.info(JSON.stringify({head,sourceFileCount:files.length,paperFileCount:paperFiles.length,scope:'Offline exact current-source passport, no hardware'}))
