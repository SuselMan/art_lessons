import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

async function main() {
  const out=process.env.QA_OUTPUT!
  await mkdir(out,{recursive:true})
  const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
  const reports:unknown[]=[]
  try {
    for(const {fallback,independent,mixer=false} of [{fallback:false,independent:false},{fallback:true,independent:false},{fallback:false,independent:true},{fallback:true,independent:true},{fallback:false,independent:true,mixer:true},{fallback:true,independent:true,mixer:true}].filter(s=>process.env.QA_MIXER_ONLY!=='1'||('mixer' in s && s.mixer))) {
      const context=await browser.newContext({baseURL:process.env.QA_URL??'http://127.0.0.1:5386'})
      try {
        await context.addInitScript('globalThis.__name = (fn) => fn')
        if(fallback)await context.addInitScript(()=>{
          const original=WebGLRenderingContext.prototype.getExtension
          Object.defineProperty(WebGLRenderingContext.prototype, 'getExtension', { value: function(this: WebGLRenderingContext, name:string) { return name==='EXT_blend_minmax'?null:Reflect.apply(original,this,[name]) } })
        })
        const page=await context.newPage()
        const errors:string[]=[]
        page.on('pageerror',e=>errors.push(e.message))
        await page.goto('/create')
        await page.locator('form input[type=text]').first().waitFor()
        const result=await page.evaluate(async({independent,mixer})=>{
          const enginePath='/src/engine/index.ts',registryPath='/src/engine/brushLibrary.ts'
          const {PencilEngine}=await import(enginePath)
          const registry=await import(registryPath)
          const pixels=new Uint8Array(64).map((_,i)=>((i%8+Math.floor(i/8))%3===0?40:230))
          const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))].map(v=>v.toString(16).padStart(2,'0')).join('')
          const id='imported-1234567890abcdef12345678'
          const descriptor={id,version:1,model:'stamp',category:'paint',tip:{kind:'round',hardness:.8,aspect:1,rotation:'fixed',angle:0},paperInteraction:0,spacing:.05,flow:.35,flowPer:'stamp',sizeByPressure:[[0,.2],[1,1]],flowByPressure:[[0,.2],[1,1]],opacityByPressure:[[0,.1],[1,1]],pressureSmoothingPx:0,opacity:.7,texture:{id:`asset:${hash}`,periodPx:47,strength:.45},behavior:{version:2,modulations:{size:[{control:'pressure',minimum:0,jitter:0,curve:[[0,.4],[1,1]]},{control:'tiltElevation',minimum:0,jitter:0,curve:[[0,.6],[1,1]]}]},rotation:{follow:1,random:'stroke'},grain:{mode:'moving',movement:.7,zoom:.4,rotation:.25,offsetJitter:true,brightness:.05,contrast:.1,depthMinimum:.1,depthJitter:.2,blendMode:'multiply'},rendering:{mode:'uniformGlaze',blendMode:'multiply',wetEdges:.3,burntEdges:.2,burntEdgesMode:'multiply'},taper:{start:.1,end:.35,size:.8,opacity:.7,pressure:false}}}
          const tested=independent?{...descriptor,behavior:{...descriptor.behavior,dual:{brush:{...descriptor,id:'imported-abcdef1234567890abcdef12',spacing:.19,behavior:{version:2,rotation:{follow:.8,random:'stamp'},dynamics:{size:{control:'pressure',jitter:.1,minimum:.3}},taper:{start:0,end:.2,size:.8,opacity:.5,pressure:false}}},blendMode:'multiply',sampling:'independent'}}}:descriptor
          const configured=mixer?{...tested,model:'mixer',mixer:{load:1,pickup:0,strength:1},behavior:{...tested.behavior,wetMix:{charge:1,dilution:0,attack:1,pull:0,grade:0,blur:0,blurJitter:0,wetnessJitter:0},rendering:{...tested.behavior.rendering,gammaCorrect:true}}}:tested
          registry.installBrushLibrary({schemaVersion:1,brushes:[{name:'GPU seam/tail probe',source:'qa',warnings:[],descriptor:configured}],assets:[{id:`asset:${hash}`,size:8,file:`${hash}.bin`}],skipped:[]})
          registry.installBrushPixels(`asset:${hash}`,pixels)
          const dabs=Array.from({length:64},(_,i)=>({x:390+i*4,y:470+Math.sin(i/12)*65,size:50,pressure:.3+i/100,tiltX:10,tiltY:20,aspectRatio:1,angle:0,opacity:.7,t:i*8}))
          const read=async(engine: InstanceType<typeof PencilEngine>)=>{
            const blob=await engine.exportPNG();if(!blob)throw Error('Missing export')
            const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height
            const c=canvas.getContext('2d')!;c.drawImage(bitmap,0,0);bitmap.close();return c.getImageData(0,0,canvas.width,canvas.height).data
          }
          const render=async(chunkSize:number)=>{
            const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=768;canvas.style.cssText='position:fixed;left:10000px;width:1024px;height:768px';document.body.append(canvas)
            const engine=new PencilEngine(canvas,{pageWidth:1024,pageHeight:768,userId:'gpu-probe'})
            try {
              await engine.paperReady();engine.setBaseLayers(['ink']);engine.setActiveLayer('ink');engine.setCompositeOrder([{id:'ink',opacity:1}])
              const blank=await read(engine)
              for(let i=0;i<dabs.length;i+=chunkSize)engine.appendOperation({id:`op-${i}`,type:'stroke',userId:'gpu-probe',timestamp:i,seq:i+1,strokeId:'one-gesture',...(i+chunkSize>=dabs.length?{strokeEnd:true}:{}),tool:'digitalBrush',preset:`brush:${id}@1`,layerId:'ink',color:[.1,.3,.7],dabs:dabs.slice(i,i+chunkSize)},'remote')
              const image=await read(engine),gl=canvas.getContext('webgl')!
              let painted=0;for(let i=0;i<image.length;i+=4)if(image[i]!==blank[i]||image[i+1]!==blank[i+1]||image[i+2]!==blank[i+2])painted++
              return {image,painted,error:gl.getError()}
            } finally {engine.destroy();canvas.remove()}
          }
          const full=await render(64),chunked=await render(7)
          let changed=0,max=0
          for(let i=0;i<full.image.length;i+=4){let delta=0;for(let c=0;c<4;c++)delta=Math.max(delta,Math.abs(full.image[i+c]-chunked.image[i+c]));if(delta)changed++;max=Math.max(max,delta)}
          return {painted:full.painted,chunkedPainted:chunked.painted,changed,max,errors:[full.error,chunked.error]}
        },{independent,mixer})
        console.log('Scenario',{fallback,independent,mixer},result)
        await writeFile(`${out}/case-${fallback}-${independent}-${mixer}.json`,JSON.stringify(result,null,2))
        expect(result.errors).toEqual([0,0])
        expect(result.painted).toBeGreaterThan(100)
        expect(result.errors).toEqual([0,0])
        expect(result.max).toBeLessThanOrEqual(1)
        expect(result.changed).toBeLessThanOrEqual(256)
        expect(errors).toEqual([])
        reports.push({fallback,independent,mixer,...result})
        console.log('GPU',fallback?'no EXT fallback':'native MAX',result)
      } finally {await context.close()}
    }
    await writeFile(`${out}/report.json`,JSON.stringify(reports,null,2))
  } finally {await browser.close()}
}
void main().catch(e=>{console.error(e);process.exitCode=1})
