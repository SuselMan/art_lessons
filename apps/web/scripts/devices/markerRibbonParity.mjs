// #691: an isolated real marker ribbon at its original world coordinates.
// DEVBRIDGE_PORT=5288 node .../markerRibbonParity.mjs laptop=<id> surface=<id> ipad=<id>
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { ev } from './bridge.mjs'

const peers = process.argv.slice(2).map(arg => arg.split('='))
if (peers.length < 2 || peers.some(p => p.length !== 2)) throw Error('Supply at least two name=bridge-id peers')
const fixture = JSON.parse(gunzipSync(readFileSync(new URL('../../../../e2e/fixtures/markerRibbonRegression.json.gz', import.meta.url))))
const dir = new URL(`../../../../temp/device-runs/marker-ribbon-parity-${Date.now()}/`, import.meta.url)
mkdirSync(dir, { recursive: true })
const captures = []
for (const [name, id] of peers) {
  const result = await ev(id, `
    const {PencilEngine}=await import('/src/engine/index.ts');
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
    const E=new PencilEngine(canvas,{pageWidth:1240,pageHeight:1754,userId:'rig'});
    try {
      await E._paper.ready();
      const f=${JSON.stringify(fixture)};
      E.appendOperation({id:'layer',type:'layer_add',userId:'rig',timestamp:0,layerId:'L',name:'L'});
      E.setActiveLayer('L');E.setCompositeOrder([{id:'L',opacity:1}]);
      const b=E._layers.get('L').resolveForPaint({minX:1231,minY:1221,maxX:1327,maxY:1317})[0].buffer;
      const stages=[];
      for(const op of f.ops){
        E.appendOperation(op,'remote');E._completeSettle();
        const gl=E.gl,p=new Uint8Array(96*96*4);
        gl.bindFramebuffer(gl.FRAMEBUFFER,b.fbo);
        gl.readPixels(207,731,96,96,gl.RGBA,gl.UNSIGNED_BYTE,p);
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);
        let str='';for(let j=0;j<p.length;j+=16384)str+=String.fromCharCode(...p.subarray(j,j+16384));
        stages.push({id:op.id,tool:op.tool,pixels:btoa(str)});
        await new Promise(r=>setTimeout(r,16));
      }
      return JSON.stringify({gpu:E.gpuInfo(),stages});
    }finally{E.destroy();E.gl.getExtension('WEBGL_lose_context')?.loseContext();}
  `, 60000)
  writeFileSync(new URL(name + '.json', dir), JSON.stringify(result))
  captures.push({ name, ...result })
}
const reference = captures[0]
const comparisons = captures.slice(1).map(c => {
  if (c.stages.length !== reference.stages.length) throw Error('Stage count differs')
  const stages = c.stages.map((stage, i) => {
    const a = reference.stages[i]
    if (a.id !== stage.id) throw Error('Operation order differs')
    const x = Buffer.from(a.pixels, 'base64'), y = Buffer.from(stage.pixels, 'base64')
    let max = 0, over24 = 0
    for (let j = 0; j < x.length; j++) { const d = Math.abs(x[j] - y[j]); max = Math.max(max, d); if (d > 24) over24++ }
    return { id: stage.id, tool: stage.tool, max, over24 }
  })
  return { reference: reference.name, device: c.name, gpu: c.gpu, stages, pass: stages.every(s => s.over24 === 0) }
})
writeFileSync(new URL('comparison.json', dir), JSON.stringify(comparisons, null, 2))
console.log(JSON.stringify({ dir: dir.pathname, comparisons: comparisons.map(c => ({ device: c.device, pass: c.pass, max: Math.max(...c.stages.map(s => s.max)) })) }))
if (comparisons.some(c => !c.pass)) process.exitCode = 1
