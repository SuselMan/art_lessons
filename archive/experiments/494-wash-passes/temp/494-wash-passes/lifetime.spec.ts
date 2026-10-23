// Local native-WebGL lifecycle oracle; private probes are not product API.
// @ts-nocheck
import { test, expect } from '@playwright/test'
test('watercolor programs are recreated and released',async({page})=>{
  await page.goto('/ab494.html')
  const result=await page.evaluate(async()=>{
    const {PencilEngine}=await import('/src/engine/index.ts')
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;document.body.replaceChildren(canvas)
    const engine=new PencilEngine(canvas,{paper:'flat',pageWidth:64,pageHeight:64})
    await engine.paperReady()
    const names=['_fieldOpProg','_fieldOpHighProg','_fieldOpCarryProg','_fieldOpCarryColourProg','_resampleProg','_diffuseProg','_brushDragProg','_waterFrontProg']
    const get=()=>names.map(k=>engine._watercolorPasses[k])
    const original=get()
    if(!original.every(p=>engine.gl.isProgram(p)))throw Error('missing watercolor GPU program')
    const ext=engine.gl.getExtension('WEBGL_lose_context')
    await new Promise(resolve=>{canvas.addEventListener('webglcontextlost',resolve,{once:true});ext.loseContext()})
    await new Promise(resolve=>setTimeout(resolve,100))
    await new Promise(resolve=>{canvas.addEventListener('webglcontextrestored',resolve,{once:true});ext.restoreContext()})
    await engine.paperReady()
    const restored=get()
    if(!restored.every((p,i)=>p!==original[i]&&engine.gl.isProgram(p)))throw Error('watercolor GPU program not recreated')
    engine.gl.useProgram(restored[0])
    engine.destroy()
    if(restored.some(p=>engine.gl.isProgram(p)))throw Error('watercolor GPU resource retained after destroy')
    return restored.length
  })
  expect(result).toBe(8)
})
