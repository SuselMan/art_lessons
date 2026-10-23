// Native-GPU planner oracle with explicit wet fields. Small working textures
// keep SwiftShader practical; production field sizing is covered by unit tests.
// @ts-nocheck
import {test,expect}from'@playwright/test'
import{readFileSync,writeFileSync}from'node:fs'
test('wet settle plan, frame execution and texture lifecycle',async({page})=>{
 const label=process.env.AB_LABEL??'after'
 await page.goto('/ab494.html')
 const errors=[];page.on('pageerror',e=>errors.push(String(e)))
 const result=await page.evaluate(async(label)=>{
  const {PencilEngine}=await import(label==='before'?'/src/engine/ab494Before.ts':'/src/engine/index.ts')
  const {RibbonStrokeScratch}=await import('/src/engine/src/buffers/RibbonStrokeScratch.ts')
  const {AccumulationBuffer}=await import('/src/engine/src/buffers/AccumulationBuffer.ts')
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;document.body.replaceChildren(canvas)
  const e=new PencilEngine(canvas,{paper:'fine',pageWidth:64,pageHeight:64,userId:'author'})
  await e.paperReady()
  e._gpuBudget=Infinity
  // Only the test's allocator is smaller. The copied planner and GPU passes
  // execute all their original formulas and step boundaries unchanged.
  e._diffuseFieldFor=(w,h)=>{
   if(e._settle)e._completeSettle()
   const W=Math.max(64,Math.ceil(w/32)*32),H=Math.max(64,Math.ceil(h/32)*32)
   let field=e._fieldCache[0]
   const names=['a','b','c','coverage','ca','cb','cc','mask','pressure','band']
   if(field&&(field.w!==W||field.h!==H)){for(const n of names)field[n].destroy();field=null}
   if(!field){field={w:W,h:H};for(const n of names)field[n]=new AccumulationBuffer(e.gl,W,H,n==='mask'||n==='pressure'?'linear':'nearest');e._fieldCache=[field]}
   for(const n of names)field[n].clear()
   return field
  }
  const hash=async(bytes)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')
  const owner=()=>label==='before'?e:e._settlePlan
  const cases=[]
  async function runCase(twoPaints,opDry,asyncPlan){
   e.setWatercolorAb({noSpread:false,noMigrate:false,opDry})
   const pool=e._ribbonScratchPool,scratch=new RibbonStrokeScratch(pool,true,true)
   const tile=new AccumulationBuffer(e.gl,64,64,'nearest');tile.clear()
   const entry=scratch.getOrCreate(tile)
   for(const n of ['inkLoad','inkColor','inkBase','colorBase']){entry[n]??=pool.acquire(64,64);entry[n].clear()}
   entry.filmGesture=scratch.gesture
   scratch.paints.add('0.2,0.3,0.6');if(twoPaints)scratch.paints.add('0.6,0.2,0.1')
   const ink=new Uint8Array(64*64*4),colour=new Uint8Array(64*64*4),coverage=new Uint8Array(64*64*4)
   for(let y=0;y<64;y++)for(let x=0;x<64;x++)if((x-32)**2+(y-32)**2<12**2){const i=(y*64+x)*4;ink.set([120,80,50,180],i);colour.set([45,70,95,100],i);coverage.set([180,120,80,200],i)}
   entry.inkLoad.writePixels(ink);entry.inkColor.writePixels(colour);entry.coverage.writePixels(coverage)
   const footprint={x:32,y:32,radius:14,aspect:1,angle:0}
   scratch.brushTravel=[{...footprint,dx:8,dy:2,water:0.8}]
   scratch.foreignSources=[{gesture:'earlier',footprints:[footprint]}];scratch.wetContacts=[footprint]
   const job=e._diffuseWashOps(scratch,[{buffer:tile,originX:0,originY:0}],{minX:18,minY:18,maxX:46,maxY:46},0.2,6,0.8,0.6,0.5,0.6,20)
   if(!job||job.ops.length<20)throw Error('wet planner fixture produced no GPU work')
   const stages=[]
   const ops=job.ops.map((op,i)=>()=>{stages.push(i);op();if(e.gl.getError()!==e.gl.NO_ERROR)throw Error('GL error at plan step '+i)})
   if(asyncPlan)await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('wet plan did not finish')),10000);e._startSettle(scratch,ops,()=>{job.finish();clearTimeout(timeout);resolve()});if(stages.length!==1)throw Error('first wet plan entry was deferred')})
   else{for(const op of ops)op();job.finish()}
   if(e.gl.getError()!==e.gl.NO_ERROR)throw Error('GL error in copy-back')
   const pixels=entry.inkLoad.readPixels()
   if(!pixels.some(v=>v>0)||await hash(pixels)===await hash(ink))throw Error('wet planner fixture did not move pigment')
   const fields={};for(const n of ['inkLoad','inkColor','inkDry','colorDry','coverage'])if(entry[n])fields[n]=await hash(entry[n].readPixels())
   const textures=[owner()._brushFlowTex,owner()._foreignWaterTex]
   if(!textures.every(t=>t&&e.gl.isTexture(t)))throw Error('wet planner did not create both textures')
   scratch.destroy();tile.destroy()
   return {steps:job.ops.length,stages,fields}
  }
  for(const [twoPaints,opDry] of [[false,false],[true,false],[true,true]]){
   const sync=await runCase(twoPaints,opDry,false),async=await runCase(twoPaints,opDry,true)
   if(JSON.stringify(sync)!==JSON.stringify(async))throw Error('frame execution changed wet plan pixels or step order')
   cases.push(sync)
  }
  const originalTextures=[owner()._brushFlowTex,owner()._foreignWaterTex]
  const ext=e.gl.getExtension('WEBGL_lose_context')
  await new Promise(resolve=>{canvas.addEventListener('webglcontextlost',resolve,{once:true});ext.loseContext()})
  if(owner()._brushFlowTex!==null||owner()._foreignWaterTex!==null)throw Error('lost-context texture handles not forgotten')
  await new Promise(resolve=>setTimeout(resolve,100))
  await new Promise(resolve=>{canvas.addEventListener('webglcontextrestored',resolve,{once:true});ext.restoreContext()})
  await e.paperReady()
  const restored=await runCase(false,false,false)
  const textures=[owner()._brushFlowTex,owner()._foreignWaterTex]
  if(!textures.every((t,i)=>t!==originalTextures[i]&&e.gl.isTexture(t)))throw Error('settle textures not recreated')
  e.destroy()
  if(textures.some(t=>e.gl.isTexture(t)))throw Error('settle textures retained after destroy')
  return {cases,restored}
 },label)
 expect(errors).toEqual([])
 writeFileSync('temp/494-wash-settle/plan-'+label+'.json',JSON.stringify(result,null,2))
 if(label!=='before')expect(result).toEqual(JSON.parse(readFileSync('temp/494-wash-settle/plan-before.json','utf8')))
})
