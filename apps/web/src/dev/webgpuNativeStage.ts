import { CanonicalWatercolorWebGpu } from '../engine/src/webgpuCanonical/backend'
import { compositeGlOracle } from '../engine/src/webgpuCanonical/compositeOracle'
import { ribbonGlOracle, stampGlOracle } from '../engine/src/webgpuCanonical/ribbonOracle'
import { buildRibbonBands } from '../engine/src/dabs/markerRibbon'
import type { Dab } from '@grafetto/shared'
import type { CanonicalRibbonBatch, CanonicalStamp } from '../engine/src/webgpuCanonical/types'
const canvas = document.querySelector<HTMLCanvasElement>('#stage')!
const width = 256, height = 192
const bytes = new Uint8Array(256 * 256 * 4).fill(128)
const backend = await CanonicalWatercolorWebGpu.create({ canvas, width, height, paper: { bytes, width:256, height:256, origin: [0, -height], texSize: [256,256], scale: 1 } })
const dabs: Dab[] = Array.from({ length: 20 }, (_, k) => ({ x: 32 + k * 9, y: 70 + Math.sin(k / 3) * 20, size: 40, aspectRatio: 1, angle: 0, opacity: 1, pressure: .8, tiltX: 0, tiltY: 0, t: k * 10 }))
const vertices = buildRibbonBands(dabs, 1, undefined, 'ellipse', 0, 1, () => ({ ink: .14, water: .8, paperWet: .7, strength: .11, puddle: .5, pigmentPool: .3 }), true)
const batch: CanonicalRibbonBatch = { vertices, inkBlend: 'max', uniforms: { aaPx: 1, washWater: .8, waterRetain: .4, bristleCombs: 4, bristleInk: .1, tau: [1, 2, .7], worldOrigin: [0, -height], mottleSeed: [4, 9], cloudDeposit: .08, granDeposit: .12, poolBlot: 1, useAvailableWater: false } }
const gpuErrors: string[] = []
backend.device.addEventListener('uncapturederror', event => { gpuErrors.push(event.error.message); document.querySelector('#status')!.textContent = event.error.message })
backend.appendPreparedRibbon(batch); await backend.whenIdle(); backend.presentField(backend.fields.pigment)
const snapshot = await backend.readSnapshot()
const nonzero = Object.fromEntries(Object.entries(snapshot.fields).map(([name, data]) => [name, data.reduce((sum, b) => sum + +(b > 0), 0)]))
const reference=ribbonGlOracle(batch,width,height)
const parity=Object.fromEntries(Object.entries(reference).map(([name,bytes])=>{const gpu=snapshot.fields[name as keyof typeof snapshot.fields];let changed=0,max=0;for(let k=0;k<bytes.length;k++){const d=Math.abs(bytes[k]-gpu[k]);if(d)changed++;max=Math.max(max,d)}return[name,{changed,max}]}))
backend.clear();
const stamp: CanonicalStamp={center:[32,70],radius:20,aspect:1,angle:0,pressure:.8,opacity:.14,nibShape:'ellipse',cornerRadius:0,inkEdge:.4,inkWater:.8,paperWet:.7,inkStrength:.11,puddle:.5,pigmentPool:.3,acrossLocal:[1,0],inkClip:0,inkBlend:'max',uniforms:batch.uniforms};
backend.appendPreparedStamp(stamp);await backend.whenIdle();const stampSnapshot=await backend.readSnapshot();const stampReference=stampGlOracle(stamp,width,height);const stampParity=Object.fromEntries(Object.entries(stampReference).map(([name,bytes])=>{const gpu=stampSnapshot.fields[name as keyof typeof stampSnapshot.fields];let changed=0,max=0;for(let k=0;k<bytes.length;k++){const d=Math.abs(bytes[k]-gpu[k]);if(d)changed++;max=Math.max(max,d)}return[name,{changed,max}]}));
const original=backend.createField('QA original',width,height),out=backend.createField('QA canonical output',width,height);backend.restoreSnapshot(snapshot);const compositeUniforms={paperOrigin:[0,-height] as const,paperTexSize:[256,256] as const,paperScale:[1,1] as const,fieldOffset:[4,9] as const,inkSmoothPx:0,water:.8,inkStrength:.8,spreadPx:4,edgeWander:.2,edgeSoft:.1,bristleCombs:4,dryContact:0,granulation:.2,wetEdge:.2,wetEdgeRadiusPx:4,tideLo:.3,tideHi:.7,paperRim:.1,opacity:1,pigmentOpacity:.2,debugView:0,rectComposite:true,migrate:0};backend.compositeInto(original,out,compositeUniforms);await backend.whenIdle();backend.present(out);const compositeBytes=await backend.readField(out),compositeReference=compositeGlOracle(snapshot,bytes,compositeUniforms);let compositeChanged=0,compositeMax=0;for(let k=0;k<compositeBytes.length;k++){const d=Math.abs(compositeBytes[k]-compositeReference[k]);if(d)compositeChanged++;compositeMax=Math.max(compositeMax,d)}
Object.assign(window, { __canonicalWebGpu: backend, __canonicalBatch: batch, __canonicalStage: { compositeParity:{changed:compositeChanged,max:compositeMax},stampParity, parity, gpuErrors, nonzero, vertices: vertices.length / 11 } })
document.querySelector('#status')!.textContent = JSON.stringify({ stage: 'production ribbon deposit only — settle/composite unavailable', nonzero, vertices: vertices.length / 11 })
