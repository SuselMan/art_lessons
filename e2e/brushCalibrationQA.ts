import { chromium, expect } from '@playwright/test'
import sharp from 'sharp'
import { strokeDabs, type Operation } from '../packages/shared/src/index'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
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
    const existing=process.env.QA_CALIBRATION_ROOM
    const room=existing??await createRoom(owner,'Procreate — четыре кисти для сравнения')
    if(existing)await joinRoom(owner,room,'Повторная проверка исходного листа')
    await waitForRoomReady(owner)
    await writeFile(`${out}/room-id`,room)
    const names=['Main Brush','Wet Brush','Wet Blender','Loaded Colour Brush']
    const brushes=await owner.evaluate(async names=>{
      const library=await (await fetch('/api/brush-library')).json()
      return names.map(name=>library.brushes.filter((b:{source:string;name:string})=>b.source.endsWith('.brushset')&&b.name===name).sort((a:{descriptor:{version:number}},b:{descriptor:{version:number}})=>b.descriptor.version-a.descriptor.version)[0])
    },names)
    if(brushes.some(b=>!b||b.descriptor.version<5))throw Error('Expected four current Procreate descriptors')
    await joinRoom(peer,room,'Проверка листа')
    let count=existing?16:0
    if(!existing){
    await owner.evaluate(()=>window.__roomStore!.getState().setTool('digitalBrush'))
    const cdp=await contexts[0].newCDPSession(owner)
    const box=await owner.locator('canvas').first().boundingBox()
    if(!box)throw Error('Missing canvas bounds')
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
    }
    const readOperations=()=>owner.evaluate(async room=>{
      const response=await fetch(`/api/rooms/${room}/operations?beforeSeq=2147483647&limit=500`)
      if(!response.ok)throw Error('Cannot read source operations for pressure audit')
      return response.json()
    },room) as Promise<Operation[]>
    await expect.poll(async()=>(await readOperations()).filter(o=>o.type==='stroke').length,{timeout:60_000}).toBe(count)
    const operations=await readOperations()
    // Restored snapshots can cover the newest operations without retaining
    // those operations in the client log. Room readiness plus exact exported
    // pixels is the oracle; retained operation counts/seq are not.
    const waitForTail=()=>waitForRoomReady(peer)
    await waitForTail()
    const pixels=async(page:typeof owner)=>{
      const encoded=await page.evaluate(async()=>{
        const blob=await window.__engine!.exportPNG();if(!blob)throw Error('Missing export')
        return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})
      })
      const png=Buffer.from(encoded,'base64')
      return {png,raw:await sharp(png).ensureAlpha().raw().toBuffer()}
    }
    const actualOwner=await pixels(owner)
    const expectedPath=process.env.QA_EXPECTED_PNG
    const expectedPng=expectedPath?await readFile(expectedPath):null
    const before=expectedPng?{png:expectedPng,raw:await sharp(expectedPng).ensureAlpha().raw().toBuffer()}:actualOwner
    await writeFile(`${out}/sheet.png`,before.png)
    const comparisons:{label:string;changed:number;max:number}[]=[]
    const compare=async(label:string,other:Awaited<ReturnType<typeof pixels>>)=>{
      await writeFile(`${out}/${label}.png`,other.png)
      let changed=0,max=0
      for(let i=0;i<before.raw.length;i+=4){let delta=0;for(let c=0;c<4;c++)delta=Math.max(delta,Math.abs(before.raw[i+c]-other.raw[i+c]));if(delta)changed++;max=Math.max(max,delta)}
      comparisons.push({label,changed,max})
      await writeFile(`${out}/comparisons.json`,JSON.stringify(comparisons,null,2))
      console.log('Pixels',label,{changed,max})
    }
    if(existing)await compare('owner-rejoined',actualOwner)
    await compare('live-peer',await pixels(peer))
    await peer.reload();await peer.locator('form input[type=text]').first().fill('Повторная проверка листа');await peer.locator('form button[type=submit]').click();await waitForRoomReady(peer)
    await waitForTail()
    await compare('reload-peer',await pixels(peer))
    // Confirmed operations may keep only compact dab payloads in the client.
    const imported=operations.filter(o=>o.type==='stroke'&&o.preset?.startsWith('brush:imported-'))
    const pressure=imported.flatMap(o=>o.type==='stroke'?strokeDabs(o).map(d=>d.pressure):[])
    await writeFile(`${out}/source-operations.json`,JSON.stringify(operations))
    expect(Math.max(...pressure)-Math.min(...pressure)).toBeGreaterThan(.2)
    expect(errors).toEqual([])
    await owner.screenshot({path:`${out}/screen.png`})
    await writeFile(`${out}/report.json`,JSON.stringify({room,brushes:brushes.map(b=>({name:b.name,descriptor:b.descriptor,compatibility:b.compatibility})),strokes:count,pressure:{min:Math.min(...pressure),max:Math.max(...pressure)},comparisons,liveAndReload:comparisons.every(c=>!c.changed)?'pixel equal':'differences measured',vendorComparison:'pending',errors},null,2))
    for(const c of comparisons)expect(c.changed,c.label).toBe(0)
    console.log('PASS four source brushes, pressure ramp, colour crossings, peer and reload')
  } finally {await Promise.all(contexts.map(c=>c.close()));await browser.close()}
}
void main().catch(error=>{console.error(error);process.exitCode=1})
