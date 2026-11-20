import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { startBrushImportProcess, type BrushImportProcess } from './importProcess.js'
const handles:BrushImportProcess[]=[],dirs:string[]=[]
afterEach(async()=>{for(const h of handles.splice(0)){h.cancel();await h.finished.catch(()=>{})}await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))})
function live(pid:number):boolean { try { const stat=readFileSync(`/proc/${pid}/stat`,'utf8');return stat.slice(stat.lastIndexOf(')')+2).split(' ')[0]!=='Z' } catch(error) {if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error} }
async function receipt(file:string){for(let i=0;i<150;i++){try{return JSON.parse(await readFile(file,'utf8'))as{parent:number;child:number}}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await new Promise(r=>setTimeout(r,20))}}throw Error('Own fixture did not start')}
async function fixture(exit=false,timeout=5000){
 const dir=await mkdtemp(join(tmpdir(),'brush-import-tree-'));dirs.push(dir);const file=join(dir,'pids.json')
 const source=`const{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});writeFileSync(process.argv[1],JSON.stringify({parent:process.pid,child:c.pid}));${exit?'process.exit(0)':'setInterval(()=>{},1000)'}`
 const h=startBrushImportProcess(process.execPath,['-e',source,file],{PATH:process.env.PATH},timeout);handles.push(h)
 // Register rejection handler immediately; the test checks its actual outcome.
 const outcome=h.finished.then(()=>({ok:true,error:undefined}),error=>({ok:false,error}))
 return {h,outcome,file}
}
describe('owned importer process tree',()=>{
 it('kills parent and grandchild before cancellation finishes, including idempotent cancel',async()=>{
  const {h,outcome,file}=await fixture(),p=await receipt(file);expect(live(p.parent)&&live(p.child)).toBe(true)
  h.cancel();h.cancel();const result=await outcome;expect(result.ok).toBe(false);expect(result.error.message).toBe('Brush import interrupted')
  expect(live(p.parent)).toBe(false);expect(live(p.child)).toBe(false)
  await rm(file);h.cancel() // no stale group signal after close
 })
 it('deadline stops the whole tree before work cleanup / next queue item',async()=>{
  const {outcome,file}=await fixture(false,1500),p=await receipt(file)
  const result=await outcome;expect(result.ok).toBe(false);expect(result.error.message).toBe('Brush import timed out');expect(live(p.parent)).toBe(false);expect(live(p.child)).toBe(false)
  await rm(file)
  const next=startBrushImportProcess(process.execPath,['-e','process.exit(0)'],{PATH:process.env.PATH});handles.push(next);await next.finished
 })
 it('normal Python exit cannot leak an unexpected still-running decoder',async()=>{
  const {outcome,file}=await fixture(true),result=await outcome,p=await receipt(file);expect(result.ok).toBe(true);expect(live(p.parent)).toBe(false);expect(live(p.child)).toBe(false)
 })
 it('keeps nonzero/spawn failures fatal and validates deadline before spawn',async()=>{
  for(const [cmd,args]of [[process.execPath,['-e','process.exit(7)']],['/nonexistent-grafetto-importer',[]]]as const){const h=startBrushImportProcess(cmd,args,{PATH:process.env.PATH});handles.push(h);await expect(h.finished).rejects.toThrow()}
  expect(()=>startBrushImportProcess(process.execPath,[],{},120001)).toThrow('Invalid brush import deadline')
 })
})
