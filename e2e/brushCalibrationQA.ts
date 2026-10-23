import { chromium, expect } from '@playwright/test'
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRoom, drawStroke, joinRoom, setBrushSize, waitForRoomReady } from './support/room'

/** Private owner-supplied resources; prepares a repeatable sheet for vendor comparison. */
async function main() {
  const out=process.env.QA_OUTPUT
  if(!out)throw Error('QA_OUTPUT is required')
  await mkdir(out,{recursive:true})
  const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
  const contexts=await Promise.all([0,1].map(()=>browser.newContext({baseURL:process.env.QA_URL??'http://127.0.0.1:5386',viewport:{width:1920,height:1440}})))
  const errors:string[]=[]
  try {
    const [owner,peer]=await Promise.all(contexts.map(c=>c.newPage()))
    for(const page of [owner,peer])page.on('pageerror',e=>errors.push(e.message))
    const room=await createRoom(owner,'Procreate — четыре кисти для сравнения')
    await waitForRoomReady(owner)
    const names=['Main Brush','Wet Brush','Wet Blender','Loaded Colour Brush']
    const brushes=await owner.evaluate(async names=>{
      const library=await (await fetch('/api/brush-library')).json()
      return names.map(name=>library.brushes.filter((b:{source:string;name:string})=>b.source.endsWith('.brushset')&&b.name===name).sort((a:{descriptor:{version:number}},b:{descriptor:{version:number}})=>b.descriptor.version-a.descriptor.version)[0])
    },names)
    if(brushes.some(b=>!b||b.descriptor.version<5))throw Error('Expected four current Procreate descriptors')
    await joinRoom(peer,room,'Проверка листа')
    await owner.evaluate(()=>window.__roomStore!.getState().setTool('digitalBrush'))
    const cdp=await contexts[0].newCDPSession(owner)
    const box=await owner.locator('canvas').first().boundingBox()
    if(!box)throw Error('Missing canvas bounds')
    let count=0
    for(const [row,brush] of brushes.entries()) {
      const y=200+row*260
      console.log('Preparing reference',brush.name)
      // Two dry colour bands make pickup visible even for an almost-empty blender.
      await owner.evaluate(()=>window.__roomStore!.getState().setToolSetting('digitalBrush','brush','hard-round'))
      for(const [offset,color] of [[0,[.75,.08,.04]],[70,[.9,.65,.03]]] as const) {
        await owner.evaluate(c=>window.__engine!.setColor([...c]),color)
        await drawStroke(owner,[[680,y+offset],[1000,y+offset]],{size:80});count++
      }
      await owner.getByRole('button',{name:/^(Brush|Кисть)$/}).first().click()
      await owner.getByRole('option',{name:`Procreate · ${brush.name}`,exact:true}).click()
      await setBrushSize(owner,100)
      await owner.evaluate(()=>window.__engine!.setColor([.04,.2,.75]))
      const points=Array.from({length:13},(_,i)=>({x:720+i*23,y:y-45+i*12,pressure:.15+i*.85/12}))
      for(const [i,p] of points.entries())await cdp.send('Input.dispatchMouseEvent',{type:i===0?'mousePressed':'mouseMoved',x:box.x+p.x,y:box.y+p.y,button:'left',buttons:1,clickCount:1,pointerType:'pen',force:p.pressure,tiltX:0,tiltY:0})
      const last=points.at(-1)!
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x+last.x,y:box.y+last.y,button:'left',buttons:0,clickCount:1,pointerType:'pen',force:0})
      count++
      // An isolated mark separates the tip/grain from continuous mixing.
      await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x+1120,y:box.y+y+35,button:'left',buttons:1,clickCount:1,pointerType:'pen',force:.7})
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x+1120,y:box.y+y+35,button:'left',buttons:0,clickCount:1,pointerType:'pen',force:0})
      count++
      await expect.poll(()=>owner.evaluate(()=>window.__engine!.getOperations().filter(o=>o.type==='stroke').length),{timeout:60_000}).toBe(count)
    }
    await expect.poll(()=>peer.evaluate(()=>window.__engine!.getOperations().filter(o=>o.type==='stroke').length),{timeout:60_000}).toBe(count)
    const pixels=async(page:typeof owner)=>{
      const encoded=await page.evaluate(async()=>{
        const blob=await window.__engine!.exportPNG();if(!blob)throw Error('Missing export')
        return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})
      })
      const png=Buffer.from(encoded,'base64')
      return {png,raw:await sharp(png).ensureAlpha().raw().toBuffer()}
    }
    const before=await pixels(owner)
    expect(Buffer.compare(before.raw,(await pixels(peer)).raw)).toBe(0)
    await peer.reload();await peer.locator('form input[type=text]').first().fill('Повторная проверка листа');await peer.locator('form button[type=submit]').click();await waitForRoomReady(peer)
    expect(Buffer.compare(before.raw,(await pixels(peer)).raw)).toBe(0)
    const pressure=await owner.evaluate(()=>window.__engine!.getOperations().filter(o=>o.type==='stroke'&&o.preset?.startsWith('brush:imported-')).flatMap(o=>o.type==='stroke'?(o.dabs??[]).map(d=>d.pressure):[]))
    expect(Math.max(...pressure)-Math.min(...pressure)).toBeGreaterThan(.2)
    expect(errors).toEqual([])
    await writeFile(`${out}/sheet.png`,before.png)
    await owner.screenshot({path:`${out}/screen.png`})
    await writeFile(`${out}/report.json`,JSON.stringify({room,brushes:brushes.map(b=>({name:b.name,descriptor:b.descriptor,compatibility:b.compatibility})),strokes:count,pressure:{min:Math.min(...pressure),max:Math.max(...pressure)},liveAndReload:'pixel equal',vendorComparison:'pending',errors},null,2))
    console.log('PASS four source brushes, pressure ramp, colour crossings, peer and reload')
  } finally {await Promise.all(contexts.map(c=>c.close()));await browser.close()}
}
void main().catch(error=>{console.error(error);process.exitCode=1})
