import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { createRoom, waitForRoomReady, drawStroke, operations, waitForOperations, joinRoom } from '../support/room'

test('watercolor: rapid undo/redo during settle and reveal survives rejoin', async ({ page }, info) => {
  const phases: unknown[]=[]
  const state=async(label:string)=>{const r=await page.evaluate(label=>{const e=window.__engine as any;return{label,at:performance.now(),identitySame:e===(window as any).__rapidQaEngine,settle:!!e._settle,queue:e._opQueue.length,rebuild:e._rebuildJobs.size,pending:e._pendingRebuilds.size,reveals:e._washReveals.size,strokes:e.getOperations().filter((o:any)=>o.type==='stroke').length,gl:e.gl.getError(),lost:e.gl.isContextLost()}},label);phases.push(r);writeFileSync(info.outputPath('phases.json'),JSON.stringify(phases,null,2));expect(r.identitySame).toBe(true);expect(r.gl).toBe(0);expect(r.lost).toBe(false);return r}
  const solverIdle=()=>page.waitForFunction(()=>{const e=window.__engine as any;return !e._settle&&!e._opQueue.length&&!e._rebuildJobs.size&&!e._pendingRebuilds.size},undefined,{timeout:60000})
  const displayIdle=async()=>{await page.waitForFunction(()=>{const e=window.__engine as any;return !e._settle&&!e._opQueue.length&&!e._rebuildJobs.size&&!e._pendingRebuilds.size&&!e._washReveals.size},undefined,{timeout:60000});await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))))}
  const canonical=async()=>page.evaluate(async()=>{const e=window.__engine as any;if(e!==(window as any).__rapidQaEngine)throw Error('engine replaced before export');const blob=await e.exportPNG(true);if(!blob)throw Error('empty export');if(e!==window.__engine)throw Error('engine replaced during export');const b=await createImageBitmap(blob),c=document.createElement('canvas');c.width=b.width;c.height=b.height;const g=c.getContext('2d')!;g.drawImage(b,0,0);b.close();const pixels=g.getImageData(0,0,c.width,c.height).data;let painted=0,maxAlpha=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i]>0)painted++;maxAlpha=Math.max(maxAlpha,pixels[i])}const digest=await crypto.subtle.digest('SHA-256',pixels);return{w:c.width,h:c.height,painted,maxAlpha,rgbaSha:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')}})
  await page.addInitScript(()=>localStorage.setItem('al_locale','en'))
  const room=await createRoom(page,'QA rapid watercolor undo');await waitForRoomReady(page)
  const passport=await page.evaluate(()=>{const e=window.__engine as any;(window as any).__rapidQaEngine=e;const s=window.__roomStore!.getState();s.setTool('watercolor');s.setToolSetting('watercolor','nib','round');s.setToolSetting('watercolor','water',1);s.setToolSetting('watercolor','pigment',1);const p=e._ribbonPainter,ext=e.gl.getExtension('WEBGL_debug_renderer_info');return{timeOrigin:performance.timeOrigin,renderer:ext?e.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):e.gl.getParameter(e.gl.RENDERER),segment:p.diagnosticSegmentDelivery,solvent:p.diagnosticSolventField,foreign:p.diagnosticForeignSolvent,radius:p.diagnosticCanonicalSettleRadius}})
  writeFileSync(info.outputPath('passport.json'),JSON.stringify(passport,null,2))
  expect(passport.segment).toBe('combined');expect(passport.solvent).toBe(true);expect(passport.foreign).toBe(true);expect(passport.radius).toBe(true)
  await page.waitForTimeout(150)
  await drawStroke(page,[[380,360],[540,365],[470,405],[610,400]],{size:80});await waitForOperations(page,'stroke',1)
  const before=await state('pen-up');expect(before.settle||before.rebuild>0).toBe(true)
  for(let i=0;i<3;i++){await page.keyboard.press('Control+z');await state('settle-undo-'+i);await page.keyboard.press('Control+Shift+z');await state('settle-redo-'+i)}
  await displayIdle();const settleControl=await canonical();expect(settleControl.painted).toBeGreaterThan(0)
  // Redo rebuild deliberately has no presentation reveal. Start a separate
  // native gesture to exercise undo while an actual live reveal remains.
  await drawStroke(page,[[390,460],[580,465]],{size:80});await waitForOperations(page,'stroke',2)
  await solverIdle();const reveal=await state('second-native-solver-complete');expect(reveal.reveals).toBeGreaterThan(0)
  // These are actual app hotkeys, while presentation still has pending pixels.
  for(let i=0;i<2;i++){await page.keyboard.press('Control+z');await state('reveal-undo-'+i);await page.keyboard.press('Control+Shift+z');await state('reveal-redo-'+i)}
  await displayIdle();expect((await operations(page)).filter(o=>o.type==='stroke')).toHaveLength(2)
  const final=await canonical();expect(final.painted).toBeGreaterThan(0);expect(final.maxAlpha).toBeGreaterThan(3);writeFileSync(info.outputPath('canonical-before.json'),JSON.stringify({room,passport,settleControl,final},null,2));await state('final-canonical')
  await page.screenshot({path:info.outputPath('rapid-undo-final.png')})
  await joinRoom(page,room,'Rapid QA rejoin');await page.evaluate(()=>{(window as any).__rapidQaEngine=window.__engine});await displayIdle()
  expect((await operations(page)).filter(o=>o.type==='stroke')).toHaveLength(2)
  const joined=await canonical();writeFileSync(info.outputPath('canonical.json'),JSON.stringify({room,passport,settleControl,final,joined},null,2));expect(joined.painted).toBeGreaterThan(0);expect(joined).toEqual(final);await state('rejoined-canonical')
  await info.attach('rapid-undo-report',{body:JSON.stringify({room,passport,phases,final,joined},null,2),contentType:'application/json'})
})
