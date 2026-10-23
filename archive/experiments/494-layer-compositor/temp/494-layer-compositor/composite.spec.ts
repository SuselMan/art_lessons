// @ts-nocheck -- local browser proof with explicit private probes.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
for (const infinite of [false, true]) test(`layer composite ${infinite ? 'infinite' : 'bounded'}`, async ({page}) => {
 const errors=[]; page.on('pageerror',e=>errors.push(String(e)))
 await page.addInitScript(()=>{Date.now=()=>1791000000000})
 await page.goto('/ab494.html')
 const label=process.env.AB_LABEL ?? 'after'
 const result=await page.evaluate(async({infinite,label})=>{
  const {PencilEngine}=await import(label==='before'?'/src/engine/ab494Before.ts':'/src/engine/index.ts')
  const {computeCompositeOrder}=await import('/src/lib/layers/layers.ts')
  const canvas=document.createElement('canvas'); canvas.width=128; canvas.height=128; document.body.replaceChildren(canvas)
  const e=new PencilEngine(canvas,{userId:'a',infinite,pageWidth:128,pageHeight:128,paper:'fine'}); await e.paperReady()
  e._tileSize=()=>({w:64,h:64})
  const camera=(zoom=1,angle=0)=>infinite?e.setInfiniteCamera(64,64,zoom,angle):e.setViewport(64,64,zoom,angle)
  camera(); let seq=0; const ops=[]
  const add=op=>{op={...op,userId:'a',timestamp:Date.now(),seq:++seq};ops.push(op); e.appendOperation(op,'remote'); e._flushOpQueue();e._completeSettle()}
  for(const id of ['A','B','C']) add({id:'add-'+id,type:'layer_add',layerId:id,name:id})
  let order=[{id:'A',opacity:0.7},{id:'B',opacity:0.8},{id:'C',opacity:0.6}];e.setCompositeOrder(order);e.setActiveLayer('B')
  const colours={A:[90,10,5,128],B:[0,65,5,100],C:[5,0,80,110]}
  for(const id of ['A','B','C']){
   const layer=e._layers.get(id),rect={minX:0,minY:0,maxX:128,maxY:128}
   for(const t of layer.resolveForPaint(rect)){const p=new Uint8Array(t.buffer.width*t.buffer.height*4);for(let i=0;i<p.length;i+=4)p.set(colours[id],i);t.buffer.writePixels(p)}
   layer.markContentPainted(rect)
  }
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes instanceof ArrayBuffer?bytes:new Uint8Array(bytes)))).map(x=>x.toString(16).padStart(2,'0')).join('')
  const out={}; const snap=async name=>{
   e._washReveals.clear();e._paperWet.clear();e._wetTexAt=0;e._display();e._composeToFBO(true)
   const p=e._compositeFBO.readPixels(), assembly=e._assemblyFBO.readPixels()
   if(e.gl.getError()!==e.gl.NO_ERROR)throw Error(name+' GL error')
   e.setCompositeOrder([...order]);e._composeToFBO(true)
   if(await hash(p)!==await hash(e._compositeFBO.readPixels()))throw Error(name+' stale split cache')
   const exports={};for(const [key,blob] of [['png',await e.exportPNG()],['transparent',await e.exportPNG(true)],['preview',await e.bakePreview(96)]]){if(!blob)throw Error('empty export');exports[key]=await hash(await blob.arrayBuffer())}
   out[name]={composite:await hash(p),assembly:await hash(assembly),canvas:canvas.toDataURL(),exports}
   return p
  }
  e._invalidateSplitCache();const p=await snap('three-colour-over')
  let expected=[0,0,0,0];for(const {id,opacity} of order){const c=colours[id];expected=expected.map((v,i)=>c[i]*opacity+v*(1-c[3]*opacity/255))}
  const centre=(64*128+64)*4;for(let i=0;i<4;i++)if(Math.abs(p[centre+i]-expected[i])>3)throw Error('independent Porter-Duff colour oracle '+i+': '+p[centre+i]+' / '+expected[i])
  order=[{id:'C',opacity:0.2},{id:'B',opacity:0.9},{id:'A',opacity:0.5}];e.setCompositeOrder(order);await snap('reorder-opacity')
  e.setActiveLayer('missing');await snap('no-active-layer');e.setActiveLayer('B')
  e.setDisplayFilter(new Set(['A','C']));await snap('filtered-screen');e.setDisplayFilter(null)
  const state={rootOrder:['outer','A'],items:{outer:{id:'outer',kind:'folder',visible:true,opacity:0.5,children:['inner','C']},inner:{id:'inner',kind:'folder',visible:true,opacity:0.4,children:['B']},...Object.fromEntries(['A','B','C'].map(id=>[id,{id,kind:'layer',visible:true,opacity:0.8}]))}}
  order=computeCompositeOrder(state);if(!order.some(x=>x.id==='B'&&Math.abs(x.opacity-0.16)<1e-8))throw Error('nested-folder opacity fixture');e.setCompositeOrder(order);await snap('nested-folders')
  camera(0.75,0.28);await snap('rotated-minified')
  e.previewLayerTransform([{layerId:'B',matrix:[1,0,12,0,1,8,0,0,1]}]);await snap('whole-layer-preview');e.clearLayerTransformPreview()
  camera();e.previewAreaTransform('B',{points:[10,10,55,10,55,55,10,55]},[1,0,20,0,1,5,0,0,1]);await snap('selection-preview');e.clearLayerTransformPreview()
  e._composeToFBO(false,{minX:20,minY:15,maxX:80,maxY:85});out.partial=await hash(e._assemblyFBO.readPixels());if(e.gl.isEnabled(e.gl.SCISSOR_TEST))throw Error('leaked scissor')
  camera(0.125);await snap('coarse-pyramid');camera()
  add({id:'recorded-pen',type:'stroke',layerId:'B',tool:'brushPen',preset:'normal',color:[0.2,0.5,0.1],strokeId:'recorded-pen',dabs:Array.from({length:6},(_,n)=>({x:20+n*10,y:30+n*4,pressure:0.6,size:8,opacity:0.7,aspectRatio:1,angle:0,tiltX:0,tiltY:0,t:n*20}))});await snap('recorded-stroke')
  add({id:'undo-pen',type:'operation_undo',targetOpId:'recorded-pen'});await snap('undo');add({id:'redo-pen',type:'operation_redo',targetOpId:'recorded-pen'});await snap('redo');if(out.undo.composite===out.redo.composite)throw Error('undo/redo fixture did not change pixels')
  e.resizeCanvas(140,120);camera(1.01,0.1);await snap('resized')
  const ext=e.gl.getExtension('WEBGL_lose_context');if(!ext)throw Error('no context-loss extension')
  const lost=new Promise(r=>canvas.addEventListener('webglcontextlost',r,{once:true}));ext.loseContext();await lost;await new Promise(r=>setTimeout(r,80));const restored=new Promise(r=>canvas.addEventListener('webglcontextrestored',r,{once:true}));ext.restoreContext();await restored;await new Promise(r=>setTimeout(r,120));e._completeSettle();await snap('context-restored');if(out['context-restored'].composite===await hash(new Uint8Array(canvas.width*canvas.height*4)))throw Error('context restore left empty canvas')
  e.destroy();return out
 },{infinite,label})
 expect(errors).toEqual([])
 const dir=`temp/494-layer-compositor/${label}`;mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/${infinite?'infinite':'bounded'}.json`,JSON.stringify(result))
})
