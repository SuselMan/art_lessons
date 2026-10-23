import { createRequire } from 'node:module'
const require = createRequire('/home/suselman/projects/pencil/package.json')
const { chromium } = require('@playwright/test')
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=default'] })
try {
  const page = await browser.newPage()
  await page.route('https://grafetto.com/__paper_probe', route => route.fulfill({contentType:'text/html',body:'<canvas></canvas>'}))
  await page.goto('https://grafetto.com/__paper_probe')
  await page.bringToFront()
  console.log(JSON.stringify(await page.evaluate(async () => {
    const manifest = await (await fetch('/paper/manifest.json')).json()
    const entry = manifest.assets.fine
    const cache = await caches.open('diagnostic-paper-probe')
    const url = '/paper/' + entry.texture
    await cache.put(url, await fetch(url))
    const reports=[]
    for(let run=0;run<3;run++) {
      const times={}; let mark=performance.now()
      const tick=name=>{const now=performance.now();times[name]=Math.round(now-mark);mark=now}
      const response=await cache.match(url);tick('cacheResponse')
      const counter=new TransformStream({transform(chunk,c){c.enqueue(chunk)}})
      const height=new Uint8Array(await new Response(response.body.pipeThrough(counter).pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());tick('readAndInflate')
      const res=Math.sqrt(height.length),g=Float64Array.from(entry.catchLut,v=>v/(1<<20)),out=new Uint8Array(height.length*2)
      for(let y=0;y<res;y++)for(let x=0;x<res;x++){
        const i=y*res+x,h=height[i],here=g[h]
        const v=(here-g[height[y*res+(x+1===res?0:x+1)]])*.6+(here-g[height[(y+1===res?0:y+1)*res+x]])*.8+.5
        out[i*2]=h;out[i*2+1]=v<=0?0:v>=1?255:Math.round(v*255)
      }
      tick('buildCatch')
      const gl=document.querySelector('canvas').getContext('webgl'),tex=gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE_ALPHA,res,res,0,gl.LUMINANCE_ALPHA,gl.UNSIGNED_BYTE,out);gl.generateMipmap(gl.TEXTURE_2D);gl.finish();tick('gpuUploadAndMipmaps');gl.deleteTexture(tex)
      reports.push(times)
    }
    await caches.delete('diagnostic-paper-probe')
    return {visibility:document.visibilityState,reports}
  })))
} finally { await browser.close() }
