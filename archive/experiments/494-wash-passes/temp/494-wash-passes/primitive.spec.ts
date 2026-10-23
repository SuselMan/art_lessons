// @ts-nocheck
import {test,expect} from '@playwright/test'
import {readFileSync,writeFileSync} from 'node:fs'
test('field modes reproduce baseline GPU pixels',async({page})=>{
  const label=process.env.AB_LABEL??'after'
  await page.goto('/ab494.html')
  const result=await page.evaluate(async(label)=>{
    const {PencilEngine}=await import(label==='before'?'/src/engine/ab494Before.ts':'/src/engine/index.ts')
    const {AccumulationBuffer}=await import('/src/engine/src/buffers/AccumulationBuffer.ts')
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;document.body.replaceChildren(canvas)
    const e=new PencilEngine(canvas,{paper:'flat',pageWidth:64,pageHeight:64});await e.paperReady()
    const inputs=Array.from({length:5},()=>new AccumulationBuffer(e.gl,8,8,'nearest'))
    for(let j=0;j<4;j++){const bytes=new Uint8Array(8*8*4);for(let k=0;k<bytes.length;k++)bytes[k]=(k*13+j*31)%180+30;inputs[j].writePixels(bytes)}
    const [a,b,c,d,out]=inputs,pixels=[]
    for(let mode=0;mode<=20;mode++){
      out.clear();e._fieldOp(out,a,b,mode,0.3,{c,d,scissor:[1,1,6,6],dir:[1,1],origin:[2,0.2],band:[0.5,0.2],size:[8,8],tau:[0.3,0.5,0.8],world:[3,-11,1]})
      if(e.gl.getError()!==e.gl.NO_ERROR)throw Error('field mode GL error '+mode)
      pixels.push(Array.from(out.readPixels()))
    }
    for(const b of inputs)b.destroy();e.destroy();return pixels
  },label)
  const path='temp/494-wash-passes/primitive-'+label+'.json';writeFileSync(path,JSON.stringify(result))
  if(label!=='before')expect(result).toEqual(JSON.parse(readFileSync('temp/494-wash-passes/primitive-before.json','utf8')))
})
