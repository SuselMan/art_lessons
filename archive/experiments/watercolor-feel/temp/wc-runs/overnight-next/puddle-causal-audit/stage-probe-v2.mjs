// Isolated, persistent-browser clean replay for human-ranked experiments.
// No rooms, checkpoints, source mutations or server writes.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim()
const sourceFiles = ['apps/web/src/engine/index.ts','apps/web/src/engine/src/raster/shaders.ts','apps/web/src/engine/src/presets/watercolorPresets.ts','apps/web/src/engine/src/watercolor/brushDrag.ts','apps/web/src/engine/src/raster/WatercolorSettlePlan.ts','apps/web/src/engine/src/raster/WatercolorPasses.ts','apps/web/src/engine/src/dabs/RibbonStrokePainter.ts','apps/web/src/engine/src/watercolor/wetDiffusion.ts','apps/web/src/engine/src/dabs/markerRibbon.ts']
const sourceSha256 = Object.fromEntries(sourceFiles.filter(f => existsSync(f)).map(f => [f, createHash('sha256').update(readFileSync(f)).digest('hex')]))
const { chromium } = createRequire(process.cwd() + '/package.json')('playwright')
const [inputFile, output, variantArg = 'baseline'] = process.argv.slice(2)
if (variantArg !== 'baseline' && process.env.QA_ALLOW_PATCHES !== '1') throw Error('Release source verification must use baseline/no runtime patches')
const experiment = variantArg.endsWith('.json') ? JSON.parse(readFileSync(variantArg, 'utf8')) : null
const experimentSha256 = experiment ? createHash('sha256').update(readFileSync(variantArg)).digest('hex') : null
const candidateId = experiment?.id || variantArg
const variant = experiment?.runtimePatches ? experiment.parent || 'baseline' : candidateId
const runtimePatches = experiment?.runtimePatches || []
for (const patch of runtimePatches) {
  if (!['vite-module-exact', 'vite-module-regex', 'shader-exact'].includes(patch.kind)) throw Error('Unknown runtime patch kind ' + patch.kind)
  if (patch.kind === 'shader-exact') patch.selector ||= patch.before
  // Historical metadata called this regex, but sourcePattern is literal source.
  if (patch.kind === 'vite-module-regex') { patch.before = patch.sourcePattern; patch.after = patch.replacement }
  if (!patch.before || typeof patch.after !== 'string') throw Error('Invalid runtime patch')
}
const validVariants = new Set(['baseline', 'landing-rich', 'brush-step-short', 'brush-mix-low', 'pool-color-sync', 'tide-body', 'pool-structure', 'pool-structure-soft', 'combined-soft', 'combined-gentle', 'gentle-directional', 'gentle-turn-trail'])
if (variant !== 'baseline') throw Error('New source search requires baseline parent, no historical builtins');
if (!validVariants.has(variant)) throw Error('Unknown experiment variant: ' + variant)
const input = JSON.parse(readFileSync(inputFile, 'utf8'))
if (input.cases.length !== 1 || input.cases[0].id !== 's4-n1') throw Error('Stage probe requires exactly s4-n1');
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-certificate-errors'] })
const reports = []
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1000, height: 700 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  let replacements = 0
  const modulePatchCounts = runtimePatches.map(() => 0)
  const fulfillPatched = async (route, response, body) => {
    const pathname = new URL(route.request().url()).pathname
    for (const [i, patch] of runtimePatches.entries()) {
      if (patch.kind === 'shader-exact' || pathname !== patch.module) continue
      const count = body.split(patch.before).length - 1
      if (count !== (patch.countPerResponse || 1)) throw Error('Module patch ' + i + ' expected ' + (patch.countPerResponse || 1) + ', got ' + count)
      body = body.split(patch.before).join(patch.after)
      modulePatchCounts[i]++
    }
    await route.fulfill({ response, body })
  }
  for (const module of new Set(runtimePatches.filter(p => p.kind !== 'shader-exact').map(p => p.module))) {
    await page.route('**' + module + '*', async route => {
      const response = await route.fetch()
      await fulfillPatched(route, response, await response.text())
    })
  }
  const landingVariants = ['landing-rich', 'combined-soft', 'combined-gentle', 'gentle-directional', 'gentle-turn-trail']
  const structureVariants = ['pool-structure', 'pool-structure-soft', 'combined-soft', 'combined-gentle', 'gentle-directional', 'gentle-turn-trail']
  if (landingVariants.includes(variant) || variant === 'tide-body') {
    await page.route('**/src/engine/src/presets/watercolorPresets.ts*', async route => {
      const response = await route.fetch()
      const body = await response.text()
      const pattern = landingVariants.includes(variant)
        ? /WATERCOLOR_START_EXCESS_BASE = 2(?:\.0)?\b/g
        : /WC_TIDE_RIM = 0?\.4\b/g
      const matches = body.match(pattern) || []
      if (matches.length !== 1) throw Error('Expected one ' + variant + ' constant, got ' + matches.length)
      replacements++
      let patched = body.replace(pattern, landingVariants.includes(variant) ? 'WATERCOLOR_START_EXCESS_BASE = 5' : 'WC_TIDE_RIM = 0')
      if (variant === 'gentle-turn-trail') {
        const edits = [
          [/WC_SLOW_RUN_RADII = 0?\.8\b/g, 'WC_SLOW_RUN_RADII = 2.4'],
          [/WC_SLOW_GAIN = 0?\.8\b/g, 'WC_SLOW_GAIN = 0.2666666667'],
          [/Math\.min\(0?\.65, previous \+ 0?\.2 \* turn \* pigmentGate\)/g, 'Math.min(0.2166666667, previous + 0.0666666667 * turn * pigmentGate)'],
        ]
        for (const [pattern, after] of edits) {
          if ((patched.match(pattern) || []).length !== 1) throw Error('Turn trail pattern not unique: ' + pattern)
          patched = patched.replace(pattern, after)
        }
      }
      await fulfillPatched(route, response, patched)
    })
  }
  if (variant === 'pool-color-sync') {
    await page.route('**/src/engine/index.ts*', async route => {
      const response = await route.fetch()
      const body = await response.text()
      // The colour stamp currently receives water puddle level here while
      // the matching deposit stamp receives pigmentPoolByDab. Use one pool
      // multiplier for both records, as the ribbon-band path already does.
      const pattern = /puddleByDab\.get\(drawable\[i\]\)\s*\?\?\s*1,\s*poolBlot/g
      const matches = body.match(pattern) || []
      if (matches.length !== 1) throw Error('Expected one colour-stamp pool argument, got ' + matches.length)
      replacements++
      await fulfillPatched(route, response, body.replace(pattern, 'pigmentPoolByDab.get(drawable[i]) ?? 0.5, poolBlot'))
    })
  }
  if (variant === 'brush-step-short') {
    await page.route('**/src/engine/index.ts*', async route => {
      const response = await route.fetch()
      const body = await response.text()
      const pattern = /contact\.radius \* 0?\.65\s*\/\s*S/g
      const matches = body.match(pattern) || []
      if (matches.length !== 1) throw Error('Expected one compiled contact-step constant, got ' + matches.length)
      replacements++
      await fulfillPatched(route, response, body.replace(pattern, 'contact.radius * 0.3 / S'))
    })
  }
  await page.addInitScript(({ variant, runtimePatches }) => {
    const proto = WebGLRenderingContext.prototype
    const original = proto.shaderSource
    window.__searchShaderReplacements = 0
    window.__searchDirectionalReplacements = 0
    window.__searchCustomReplacements = runtimePatches.map(() => 0)
    proto.shaderSource = function(shader, source) {
      if (variant === 'brush-mix-low' && source.includes('float mixFraction = 0.18 *')) {
        const before = 'float mixFraction = 0.18 * max(donor - neighbour, 0.0) / max(donor, 1e-4);'
        if (source.split(before).length !== 2) throw Error('Unexpected brush mixing shader')
        source = source.replace(before, before.replace('0.18', '0.06'))
        window.__searchShaderReplacements++
      }
      if (variant === 'gentle-directional' && source.includes('float mixFraction = 0.18 *')) {
        const edits = [
          ['float mixFraction = 0.18 *', 'float mixFraction = 0.08 *'],
          ['float amount = (0.18 * max(dot(velocity, direction), 0.0)', 'float amount = (0.42 * max(dot(velocity, direction), 0.0)'],
        ]
        for (const [before, after] of edits) {
          if (source.split(before).length !== 2) throw Error('Directional shader replacement not unique')
          source = source.replace(before, after)
        }
        window.__searchDirectionalReplacements++
      }
      if (['pool-structure', 'pool-structure-soft', 'combined-soft', 'combined-gentle', 'gentle-directional', 'gentle-turn-trail'].includes(variant) && source.includes('float wcPoolBlot(')) {
        const before = /float wcPoolBlot\(vec2 wp, vec2 seed, float puddle, float paperWet, float on\) \{[\s\S]*?\n  \}/g
        if ((source.match(before) || []).length !== 1) throw Error('Expected one pool-blot function per shader')
        const soft = variant === 'pool-structure-soft' || variant === 'combined-soft'
        const gentle = ['combined-gentle', 'gentle-directional', 'gentle-turn-trail'].includes(variant)
        source = source.replace(before, `float wcPoolBlot(vec2 wp, vec2 seed, float puddle, float paperWet, float on) {
    float pool = on * mix(${gentle ? '0.15' : soft ? '0.35' : '0.65'}, 1.0, smoothstep(0.5, 0.95, puddle));
    if (pool <= 0.0) return 1.0;
    float n = wcFbm(wp * ${soft || gentle ? '0.03' : '0.018'} + seed * 1.7 + vec2(13.0, 5.0));
    return mix(1.0, ${gentle ? '0.7 + 0.6 * smoothstep(0.3, 0.7, n)' : soft ? '0.4 + 1.2 * smoothstep(0.3, 0.7, n)' : '0.08 + 1.84 * smoothstep(0.38, 0.62, n)'}, pool);
  }`)
        window.__searchShaderReplacements++
      }
      for (const [i, patch] of runtimePatches.entries()) {
        if (patch.kind !== 'shader-exact' || !source.includes(patch.selector)) continue
        const count = source.split(patch.before).length - 1
        if (count !== (patch.countPerShader || 1)) throw Error('Shader patch ' + i + ' expected ' + (patch.countPerShader || 1) + ', got ' + count)
        source = source.split(patch.before).join(patch.after)
        window.__searchCustomReplacements[i]++
      }
      return original.call(this, shader, source)
    }
  }, { variant, runtimePatches })
  await page.goto(process.env.APP_URL || 'https://localhost:5288/create')
  await page.evaluate(async () => { window.__searchEngineClass = (await import('/src/engine/index.ts')).PencilEngine })
  for (const test of input.cases) {
    const result = await page.evaluate(async test => {
      const started = performance.now()
      const shaderReplacementsBefore = window.__searchShaderReplacements
      const directionalBefore = window.__searchDirectionalReplacements
      const customBefore = [...window.__searchCustomReplacements]
      const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 700
      document.body.append(canvas)
      const e = new window.__searchEngineClass(canvas, { pageWidth: 3508, pageHeight: 2480, paper: 'medium', userId: 'search' })
      let draws = 0
      const programDraws = { brush: 0, diffuse: 0, fieldHigh: 0 }
      const passes = e._watercolorPasses || e
      const fieldHighModes = {}
      const compositeFields={},compositeLog=[];const gl=e.gl;let composite=null;
      const stageFrames=[],stageEvents=[],ids=new WeakMap();let nextId=1, mapping=null, field=null, settleNo=0, diffuseCount=0, brushCount=0,brushPending=false,lastBrushDep=null,lastBrushCol=null,lastBrushScissor=null,lastBrushRect=null;
      const id=b=>{if(!b)return null;if(!ids.has(b))ids.set(b,nextId++);return ids.get(b)};
      const encode=bytes=>{let b='';for(let i=0;i<bytes.length;i+=8192)b+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(b)};
      const box=test.box; if(!Array.isArray(box)||box.length!==4)throw Error('Missing world ROI box');
      const roiCentres=[.25,.5,.75].map(t=>[box[0]+t*(box[2]-box[0]),(box[1]+box[3])/2]);
      const capture=(stage, buffers, extra={})=>{
        if(!mapping||!field)throw Error('Capture before actual mapping');
        if(stageFrames.length>=140)throw Error('Stage capture budget exceeded');
        const old=gl.getParameter(gl.FRAMEBUFFER_BINDING);const fb=gl.createFramebuffer();
        try {for(const [role,buffer]of Object.entries(buffers)){
          if(!buffer)continue;gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,buffer.texture,0);
          if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete probe framebuffer');
          const rects=roiCentres.map(([wx,wy],i)=>({name:'roi'+i,x:Math.floor((wx-mapping.x0)/mapping.S)-8,y:Math.floor(field.h-(wy-mapping.y0)/mapping.S)-8,w:16,h:16}));
          rects.push({name:'cross',x:Math.floor((box[0]-mapping.x0)/mapping.S),y:Math.floor(field.h-((box[1]+box[3])/2-mapping.y0)/mapping.S),w:Math.min(512,Math.ceil((box[2]-box[0])/mapping.S)),h:1});
          const samples=[];for(const r of rects){if(r.x<0||r.y<0||r.x+r.w>buffer.width||r.y+r.h>buffer.height){samples.push({...r,outside:true});continue}const bytes=new Uint8Array(r.w*r.h*4);gl.readPixels(r.x,r.y,r.w,r.h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);samples.push({...r,rgba:encode(bytes)})}
          stageFrames.push({stage,settleNo,role,bufferId:id(buffer),mapping:{...mapping},fieldSize:[field.w,field.h],samples,...extra});
        }}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,old);gl.deleteFramebuffer(fb)}
      };
      const prepare=e._settlePlan.prepare.bind(e._settlePlan);
      e._settlePlan.prepare=(scratch,...args)=>{
        settleNo++;diffuseCount=0;brushCount=0;lastDiffuse=null;for(const key of Object.keys(modeCounts))delete modeCounts[key];const note=scratch.noteStorageBounds.bind(scratch);let bounds;let requestedW;const originalFieldFor=e._settlePlan.ctx.fieldFor;e._settlePlan.ctx.fieldFor=(w,h)=>{requestedW=w;return originalFieldFor(w,h)};
        scratch.noteStorageBounds=b=>{bounds={...b};return note(b)};
        try{const result=prepare(scratch,...args);field=e._fieldCache[0];if(bounds&&field){const S=(bounds.maxX-bounds.minX)/requestedW;
          mapping={x0:bounds.minX,y0:bounds.minY,S};stageEvents.push({stage:'prepare',settleNo,bounds,args:args.slice(1),fieldSize:[field.w,field.h]});}
          return result;
        }finally{scratch.noteStorageBounds=note;e._settlePlan.ctx.fieldFor=originalFieldFor}
      };
      const front=passes.waterFrontStep.bind(passes);passes.waterFrontStep=(...a)=>{field=a[0];mapping={x0:a[1],y0:a[2],S:a[10]??1};const r=front(...a);return r};
      const fo=passes.fieldOp.bind(passes);const modeCounts={};passes.fieldOp=(...a)=>{const[out,aa,bb,mode,k,opts={}]=a;if(brushPending){capture('brush-final-stable-before-next-field-op',{color:lastBrushCol,pigment:lastBrushDep,coverage:field.coverage},{brushCount,lastBrushScissor,lastBrushRect});brushPending=false}const r=fo(...a);modeCounts[mode]=(modeCounts[mode]||0)+1;
        stageEvents.push({stage:'fieldOp',settleNo,mode,k,out:id(out),a:id(aa),b:id(bb),d:id(opts.d)});
        if(mode===0&&modeCounts[0]<=2)capture('initial-split',{mobile:out,source:aa,base:bb,coverage:field.coverage});
        if([11,17,18].includes(mode)&&modeCounts[mode]<=2)capture('mode'+mode,{out,a:aa,b:bb,d:opts.d,coverage:field.coverage});
        if([15,16].includes(mode)&&modeCounts[mode]<=3)capture('carry'+mode,{out,density:aa,coverage:field.coverage});
        return r;
      };
      let lastDiffuse=null;const ds=passes.diffuseStep.bind(passes);passes.diffuseStep=(...a)=>{field=a[0];mapping={x0:a[1],y0:a[2],S:a[3]};const r=ds(...a);diffuseCount++;lastDiffuse={out:a[7],gate:a[10],density:a[11]??a[6]};capture('diffuse-after-call',lastDiffuse,{diffuseCount,radius:a[8],knight:a[9],sourceId:id(a[6]),destinationId:id(a[7]),densityId:id(a[11]??a[6])});return r};
      const bp=passes.brushPass.bind(passes);passes.brushPass=(...a)=>{field=a[0];lastBrushDep=a[6];lastBrushScissor=[...a[8]];lastBrushRect=[...a[7]];if(brushCount%2===0)lastBrushCol=a[4];if(!brushCount){capture('post-settle-combined-before-brush',{pigment:a[6],color:a[4],coverage:field.coverage},{diffuseCount});capture('brush-before',{color:a[4],pigment:a[6],coverage:field.coverage})}const r=bp(...a);brushCount++;brushPending=brushCount%2===0;if(brushCount===2)capture('brush-first-contact-SCISSORED-TEMP',{color:field.band,pigment:a[5],coverage:field.coverage},{validScissor:[...a[8]],validFlowRect:[...a[7]],warning:'Temporary outputs valid only inside this scissor; copyback has not executed yet'});return r};
      const draw = e.gl.drawArrays.bind(e.gl)
      e.gl.drawArrays = (...args) => {
        const program = e.gl.getParameter(e.gl.CURRENT_PROGRAM)
        if (program === passes._brushDragProg) { draws++; programDraws.brush++ }
        if (program === passes._diffuseProg) programDraws.diffuse++
        if (program === passes._fieldOpHighProg) {
          programDraws.fieldHigh++
          if (passes._fieldOpHighUni?.u_mode) {
            const mode = e.gl.getUniform(program, passes._fieldOpHighUni.u_mode)
            fieldHighModes[mode] = (fieldHighModes[mode] || 0) + 1
          }
        }
        if(false&&composite){
          const names=['u_inkMode','u_inkSmoothPx','u_migrate','u_migratePx','u_opacity','u_color','u_wcDebugView','u_inkStrength','u_spreadPx','u_granulation','u_cloud'];const uniforms=Object.fromEntries(names.map(name=>{const loc=gl.getUniformLocation(program,name);const v=loc?gl.getUniform(program,loc):null;return [name,v?.length?Array.from(v):v]}));const key=composite.origin.join('_');compositeLog.push({...composite,uniforms});const active=gl.getParameter(gl.ACTIVE_TEXTURE);for(const name of ['u_inkLoad','u_inkColor','u_strokeCoverage']){const loc=gl.getUniformLocation(program,name);if(loc){gl.activeTexture(gl.TEXTURE0+gl.getUniform(program,loc));snap(key+'-'+name,gl.getParameter(gl.TEXTURE_BINDING_2D),composite.width,composite.height)}}gl.activeTexture(active);const result=draw(...args);snap(key+'-output',null,composite.width,composite.height);return result
        }return draw(...args)
      }
      const idle = async () => {
        const start = performance.now()
        while (e._settle || e._opQueue.length || e._rebuildJobs.size || e._pendingRebuilds.size) {
          if (performance.now() - start > 180000) throw Error('Settle timeout')
          await new Promise(r => setTimeout(r, 16))
        }
      }
      try {
        await e.paperReady()
        const layers = [...new Set(test.ops.map(op => op.layerId))]
        layers.forEach(id => e.initLayer(id))
        e.setCompositeOrder(layers.map(id => ({ id, opacity: 1 })))
        const ready = performance.now()
        for (const op of test.ops) { e.appendOperation(op, 'remote'); await idle() }
        await idle()
        if(brushCount)capture('post-settle-pressure-role-unknown',{pressure:field.pressure,coverage:field.coverage},{brushCount,warning:'Pressure reused; not final physical pigment'});
        const painted = performance.now()
        e.watercolorDryAll(); await idle()
        const dried = performance.now()
        const blob = await e.exportPNG(false)
        const bytes = new Uint8Array(await blob.arrayBuffer())
        let binary = ''
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
        const ext = e.gl.getExtension('WEBGL_debug_renderer_info')
        const gpu = ext ? e.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : e.gl.getParameter(e.gl.RENDERER)
        const lost = e.gl.isContextLost(), error = e.gl.getError()
        if (lost || error) throw Error('GPU context/error ' + error)
        return { stageFrames,stageEvents, compositeFields,compositeLog, png: btoa(binary), gpu, draws, programDraws, fieldHighModes, lost, error, shaderReplacements: window.__searchShaderReplacements - shaderReplacementsBefore,
                 directionalReplacements: window.__searchDirectionalReplacements - directionalBefore,
                 customReplacements: window.__searchCustomReplacements.map((n, i) => n - customBefore[i]),
                 timings: { setup: ready-started, paint: painted-ready, dry: dried-painted, export: performance.now()-dried } }
      } finally {
        e.destroy(); e.gl.getExtension('WEBGL_lose_context')?.loseContext(); canvas.remove()
      }
    }, test)
    writeFileSync(output+'/'+test.id+'-stages.json',JSON.stringify({frames:result.stageFrames,events:result.stageEvents},null,2));delete result.stageFrames;delete result.stageEvents;
    const bytes = Buffer.from(result.png, 'base64'); delete result.png;for(const [key,f] of Object.entries(result.compositeFields)){writeFileSync(output+'/'+test.id+'-'+key+'.rgba',Buffer.from(f.rgba,'base64'));delete f.rgba};writeFileSync(output+'/'+test.id+'-composite-fields.json',JSON.stringify(result.compositeFields,null,2));delete result.compositeFields
    writeFileSync(output + '/' + test.id + '.png', bytes)
    result.id = test.id; result.variant = candidateId; result.pngSha256 = createHash('sha256').update(bytes).digest('hex')
    reports.push(result)
    writeFileSync(output + '/report.json', JSON.stringify({ base: sourceCommit, sourceCommit, sourceSha256, fixtureBase: input.base, variant: candidateId, parent: variant, experimentSha256, modulePatchCounts, replacements, errors, complete: false, cases: reports }, null, 2))
    console.log(JSON.stringify(result))
  }
  // Vite may request both the HMR URL and the plain import URL. Every response
  // is checked above for exactly one replacement; at least one must be served.
  if (variant === 'brush-step-short' && replacements < 1) throw Error('Contact patch not applied')
  if (landingVariants.includes(variant) && replacements < 1) throw Error('Landing patch not applied')
  if (variant === 'pool-color-sync' && replacements < 1) throw Error('Colour pool patch not applied')
  if (variant === 'tide-body' && replacements < 1) throw Error('Tide patch not applied')
  if (variant === 'brush-mix-low' && !reports.every(r => r.shaderReplacements > 0)) throw Error('Shader patch not reached')
  if (structureVariants.includes(variant) && !reports.every(r => r.shaderReplacements > 0)) throw Error('Pool shader patch not reached')
  if (variant === 'gentle-directional' && !reports.every(r => r.directionalReplacements > 0 && r.draws > 0)) throw Error('Directional shader/draw not reached')
  for (const [i, patch] of runtimePatches.entries()) {
    if (patch.kind === 'shader-exact' ? !reports.every(r => r.customReplacements[i] > 0) : modulePatchCounts[i] < 1) throw Error('Custom patch not reached ' + i)
  }
  if (errors.length) throw Error('Browser errors ' + errors.join('; '))
  writeFileSync(output + '/report.json', JSON.stringify({ base: sourceCommit, sourceCommit, sourceSha256, fixtureBase: input.base, variant: candidateId, parent: variant, experimentSha256, modulePatchCounts, replacements, errors, complete: true, cases: reports }, null, 2))
} finally { await browser.close() }
