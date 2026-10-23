import { chromium, expect } from '@playwright/test'
import sharp from 'sharp'
import { zipSync } from 'fflate'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRoom, joinRoom, waitForRoomReady, drawStroke } from './support/room'

function pngText(image: Buffer, key: string, value: string): Buffer {
  const body=Buffer.from(`${key}\0${value}`), type=Buffer.from('tEXt'), length=Buffer.alloc(4), sum=Buffer.alloc(4)
  length.writeUInt32BE(body.length)
  let crc=0xffffffff
  for(const byte of Buffer.concat([type,body])) {crc^=byte;for(let i=0;i<8;i++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1}
  sum.writeUInt32BE((crc^0xffffffff)>>>0)
  return Buffer.concat([image.subarray(0,-12),length,type,body,sum,image.subarray(-12)])
}

async function main() {
  const out=process.env.QA_OUTPUT!
  await mkdir(out,{recursive:true})
  const thumbnail=await sharp({create:{width:2,height:2,channels:3,background:'#ff0000'}}).png().toBuffer()
  const make=(name:string,definition:string,mode='normal')=>pngText(pngText(thumbnail,'version','5.0'),'preset',`<Preset name="${name}" paintopid="paintbrush"><param name="brush_definition"><![CDATA[${definition}]]></param><param name="CompositeOp">${mode}</param><param name="SizeUseCurve">true</param><param name="SizeSensor"><![CDATA[<params id="pressure"><curve>0,0.2;1,1;</curve></params>]]></param></Preset>`)
  const tip=Buffer.alloc(29+64*64,255)
  for(const [i,v] of [29,2,64,64,1,0x47494d50,25].entries())tip.writeUInt32BE(v,i*4)
  tip[28]=0
  const fixtures=[
    {name:'Krita-QA.kpp',data:make('Krita QA Round','<Brush type="auto_brush" spacing="0.15"><MaskGenerator type="circle" ratio="1" hfade="1" vfade="1"/></Brush>'),label:'Krita QA Round'},
    {name:'Krita-QA.bundle',data:Buffer.from(zipSync({'paintoppresets/QA.kpp':make('Krita QA Linked','<Brush type="gbr_brush" filename="tip.gbr" spacing="0.2"/>'),'brushes/tip.gbr':tip})),label:'Krita QA Linked'},
    {name:'Krita-Erase.kpp',data:make('Krita QA Eraser','<Brush type="auto_brush" spacing="0.1"><MaskGenerator type="circle" ratio="1" hfade="1" vfade="1"/></Brush>','erase'),label:'Krita QA Eraser'},
  ]
  const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
  const contexts=await Promise.all([0,1].map(()=>browser.newContext({baseURL:process.env.QA_URL??'http://127.0.0.1:5386'})))
  const errors:string[]=[]
  const httpErrors:{path:string;status:number}[]=[]
  const pages:import('@playwright/test').Page[]=[]
  try {
    const [owner,peer]=await Promise.all(contexts.map(c=>c.newPage()))
    pages.push(owner,peer)
    for(const p of [owner,peer]){p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource'))errors.push(m.text())});p.on('response',r=>{if(r.status()>=400)httpErrors.push({path:new URL(r.url()).pathname,status:r.status()})})}
    const id=await createRoom(owner,'Krita — import QA808');await waitForRoomReady(owner)
    console.log('Identity matches',await owner.evaluate(async()=>{const me=await (await fetch('/api/me')).json();return me.userId===window.__roomStore!.getState().userId}))
    await owner.evaluate(()=>window.__roomStore!.getState().setTool('digitalBrush'))
    await owner.getByRole('button',{name:'Open Tool settings',exact:true}).click()
    for(const f of fixtures) {
      console.log('Importing',f.name)
      await owner.locator('input[type=file][accept*=".kpp"]').setInputFiles({name:f.name,mimeType:'application/octet-stream',buffer:f.data})
      await expect(owner.getByText('Imported brushes: 1',{exact:true})).toBeVisible({timeout:60_000})
    }
    await owner.getByRole('button',{name:'Collapse Tool settings',exact:true}).click()
    await joinRoom(peer,id,'Krita reader')
    const read=async(page:typeof owner)=>{
      const encoded=await page.evaluate(async()=>{const blob=await window.__engine!.exportPNG();if(!blob)throw Error('Missing export');return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})})
      return sharp(Buffer.from(encoded,'base64')).raw().toBuffer()
    }
    for(const [i,f] of fixtures.entries()) {
      await owner.getByRole('button',{name:/^(Brush|Кисть)$/}).first().click()
      await owner.getByRole('option',{name:`Krita · ${f.label}`,exact:true}).click()
      const beforeErase=i===2?await read(owner):null
      const y=250+(i===2?0:i*130)
      await drawStroke(owner,[[350,y],[450,y+50],[560,y+10]],{size:i===2?90:65})
      if(beforeErase){const after=await read(owner);let delta=0;for(let c=0;c<after.length;c++)delta+=after[c]-beforeErase[c];expect(delta).toBeGreaterThan(0)}
      await expect.poll(()=>peer.evaluate(()=>window.__engine!.getOperations().filter(o=>o.type==='stroke').length)).toBeGreaterThanOrEqual(i+1)
    }
    expect(Buffer.compare(await read(peer),await read(owner))).toBe(0)
    console.log('Live pixels match; checking reload')
    await peer.reload();await peer.locator('form input[type=text]').first().fill('Krita reader after reload');await peer.locator('form button[type=submit]').click();await waitForRoomReady(peer)
    expect(Buffer.compare(await read(peer),await read(owner))).toBe(0)
    expect(errors).toEqual([])
    await owner.screenshot({path:`${out}/krita.png`})
    await writeFile(`${out}/report.json`,JSON.stringify({room:id,formats:fixtures.map(f=>f.name),peerAndReload:'pixel equal',errors},null,2))
    console.log('PASS KPP + Bundle UI import, linked GBR, peer and reload')
  } catch(error){await writeFile(`${out}/failure.json`,JSON.stringify({error:String(error),errors,httpErrors,bodies:await Promise.all(pages.map(p=>p.locator('body').innerText().catch(()=>'')))},null,2));throw error} finally {await Promise.all(contexts.map(c=>c.close()));await browser.close()}
}
void main().catch(error=>{console.error(error);process.exitCode=1})
