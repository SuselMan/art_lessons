import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

async function main() {
  const out=process.env.QA_OUTPUT!
  await mkdir(out,{recursive:true})
  const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
  try {
    const context=await browser.newContext({baseURL:process.env.QA_URL??'http://127.0.0.1:5386'})
    try {
      await context.addInitScript('globalThis.__name=(fn)=>fn')
      const page=await context.newPage();await page.goto('/create')
      const results=await page.evaluate(async()=>{
        const shaderPath='/src/engine/src/raster/brushBehaviorShaders.ts'
        const {BRUSH_BLEND_GLSL}=await import(shaderPath)
        const canvas=document.createElement('canvas');canvas.width=canvas.height=1
        const gl=canvas.getContext('webgl',{antialias:false,preserveDrawingBuffer:true})!
        const shader=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)??'shader');return s}
        const vs=shader(gl.VERTEX_SHADER,'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}')
        const fs=shader(gl.FRAGMENT_SHADER,`precision highp float;uniform vec3 base,source;uniform float mode;${BRUSH_BLEND_GLSL}\nvoid main(){gl_FragColor=vec4(brushBlend(base,source,mode),1.0);}`)
        const program=gl.createProgram()!;gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program)
        if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)??'link')
        gl.useProgram(program);gl.viewport(0,0,1,1)
        const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW)
        const position=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0)
        const ref=document.createElement('canvas');ref.width=ref.height=1;const ctx=ref.getContext('2d')!
        const modes:[GlobalCompositeOperation,number][]=[['multiply',1],['screen',2],['overlay',3],['darken',4],['lighten',5],['color-burn',6],['color-dodge',8],['difference',11],['exclusion',12],['soft-light',13],['hard-light',14],['hue',22],['saturation',23],['color',24],['luminosity',25]]
        const pairs=[[[42,173,99],[204,58,137]],[[210,88,20],[83,199,240]],[[127,127,127],[195,30,70]]]
        const results=[]
        for(const [name,index] of modes)for(const [base,source] of pairs){
          ctx.globalCompositeOperation='copy';ctx.fillStyle=`rgb(${base.join(',')})`;ctx.fillRect(0,0,1,1)
          ctx.globalCompositeOperation=name;ctx.fillStyle=`rgb(${source.join(',')})`;ctx.fillRect(0,0,1,1)
          const expected=[...ctx.getImageData(0,0,1,1).data]
          gl.uniform3fv(gl.getUniformLocation(program,'base'),base.map(v=>v/255));gl.uniform3fv(gl.getUniformLocation(program,'source'),source.map(v=>v/255));gl.uniform1f(gl.getUniformLocation(program,'mode'),index);gl.drawArrays(gl.TRIANGLES,0,3)
          const actual=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,actual)
          results.push({name,base,source,expected,actual:[...actual],max:Math.max(...actual.map((v,i)=>Math.abs(v-expected[i])))})
        }
        const error=gl.getError();gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);gl.getExtension('WEBGL_lose_context')?.loseContext()
        return {results,error}
      })
      await writeFile(`${out}/report.json`,JSON.stringify(results,null,2))
      expect(results.error).toBe(0)
      expect(results.results.filter(r=>r.max>2)).toEqual([])
      console.log('PASS',results.results.length,'GPU blends against independent Canvas2D compositor')
    } finally {await context.close()}
  } finally {await browser.close()}
}
void main().catch(e=>{console.error(e);process.exitCode=1})
