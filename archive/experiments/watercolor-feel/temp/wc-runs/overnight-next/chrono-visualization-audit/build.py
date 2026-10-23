import pathlib,json
n=pathlib.Path('temp/wc-runs/overnight-next');out=n/'chrono-visualization-audit'
spec=json.loads((n/'full-raw-source-capture/capture-spec-v2.json').read_text());spec['runtimePatches']=spec['runtimePatches'][:-2];spec['id']='fullraw-oneshot-source-injection-normal-settle-v1';spec['scope']='Translated blank singlepaint offline diagnostic: fixed oneshot source coverage; inject offscreen/CPU model P/C before normal prepare; no final brush contacts; ordinary front/fine/tide/composite. NOT live or original room.';spec['limits']={'fixedROI':{'x':350,'y':430,'w':276,'h':199},'sourceUnitMaxMs':1000,'sourceDrawTimed':8,'modelInput':'QA_INJECT_MODEL_JSON optional PFile/CFile relative paths; absent is raw-source/no-final-brush control'};spec['runtimePatches'].append({'kind':'vite-module-exact','module':'/src/engine/index.ts','before':'_finishRibbonStroke(scratch, reveal = false, fade = reveal, spread = false) {','after':'_finishRibbonStroke(scratch, reveal = false, fade = reveal, spread = false) {\n        if(globalThis.__wcInjectFailure)throw Error(globalThis.__wcInjectFailure);\n        if(!globalThis.__wcInjectDone)globalThis.__wcInjectSource(this,scratch);','countPerResponse':1});(out/'injection-spec-v1.json').write_text(json.dumps(spec,indent=2)+'\n')
inputs=json.loads((n/'full-raw-source-capture/inputs.json').read_text());inputs['cases']=[inputs['cases'][1]];(out/'oneshot-inputs.json').write_text(json.dumps(inputs,indent=2)+'\n')
s=(n/'probe.mjs').read_text();anchor="const runtimePatches = experiment?.runtimePatches || []";payload='''
const referenceCapturePath=process.env.QA_RAW_REFERENCE;
if(!referenceCapturePath)throw Error('QA_RAW_REFERENCE oneshot capture required');
const referenceCapture=JSON.parse(readFileSync(referenceCapturePath,'utf8'));
if(referenceCapture.prefixes.length!==1)throw Error('one-shot reference required');
const reference=referenceCapture.prefixes[0],roi=reference.roi;
if(JSON.stringify(roi)!==JSON.stringify({x:350,y:430,w:276,h:199})||reference.orientation!=='bottom-up')throw Error('reference ROI/orientation');
const modelPath=process.env.QA_INJECT_MODEL_JSON;
if(modelPath&&!modelPath.startsWith('/'))throw Error('QA_INJECT_MODEL_JSON must absolute path');
const model=modelPath?JSON.parse(readFileSync(modelPath,'utf8')):null;
const modelP=model?readFileSync(new URL(model.PFile,'file://'+modelPath).pathname):Buffer.from(reference.P,'base64');
const modelC=model?readFileSync(new URL(model.CFile,'file://'+modelPath).pathname):Buffer.from(reference.C,'base64');
if(modelP.length!==roi.w*roi.h*4||modelC.length!==modelP.length)throw Error('model size');
const injectionPayload={roi,referenceP:reference.P,referenceC:reference.C,referenceCoverage:reference.coverage,P:modelP.toString('base64'),C:modelC.toString('base64'),referenceCaptureSha256:createHash('sha256').update(readFileSync(referenceCapturePath)).digest('hex'),modelSha256:modelPath?createHash('sha256').update(readFileSync(modelPath)).digest('hex'):null};
''';s=s.replace(anchor,anchor+payload)
s=s.replace('const customBefore = [...window.__searchCustomReplacements]','const customBefore = [...window.__searchCustomReplacements]\n      globalThis.__wcInjectDone=false;globalThis.__wcInjectFailure=null;globalThis.__wcInjectProof=null;')
hook='''
      const payload=test.injectionPayload;
      const bytes=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
      const roi=payload.roi,offsetY=1024-(roi.y+roi.h),offsetX=roi.x;
      const eq=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
      const crop=full=>{const a=new Uint8Array(roi.w*roi.h*4);for(let y=0;y<roi.h;y++)a.set(full.subarray(((offsetY+y)*1024+offsetX)*4,((offsetY+y)*1024+offsetX+roi.w)*4),y*roi.w*4);return a};
      const outsideZero=full=>{for(let y=0;y<1024;y++)for(let x=0;x<1024;x++)if(x<offsetX||x>=offsetX+roi.w||y<offsetY||y>=offsetY+roi.h)for(let k=0;k<4;k++)if(full[(y*1024+x)*4+k])throw Error('nonzero source outside ROI')};
      globalThis.__wcInjectSource=(engine,scratch)=>{try{
        const ctx=scratch.finishContext;if(!ctx||!ctx.profile.normalizeDeposit||scratch.paints.size!==1)throw Error('inject singlepaint normalfilm required');
        const tiles=engine._resolveWithinSheet(ctx.target,engine._wcSheetClamp(ctx.bounds));if(tiles.length!==1)throw Error('inject singleTile');const tile=tiles[0],own=scratch.peek(tile.buffer);
        if(tile.originX!==0||tile.originY!==0||tile.buffer.width!==1024||tile.buffer.height!==1024||own.filmGesture!==scratch.gesture||!own.strokeInk||!own.strokeColor||!own.inkBase||!own.colorBase||!own.inkLoad||!own.inkColor)throw Error('inject ownership');
        for(const b of[own.inkBase,own.colorBase])if(b.readPixels().some(v=>v!==0))throw Error('inject base notzero');const original=own.original.readPixels();for(let i=3;i<original.length;i+=4)if(original[i])throw Error('inject blank original');
        const originalP=own.strokeInk.readPixels(),originalC=own.strokeColor.readPixels(),coverageBefore=own.coverage.readPixels();outsideZero(originalP);outsideZero(originalC);
        if(!eq(crop(originalP),bytes(payload.referenceP))||!eq(crop(originalC),bytes(payload.referenceC))||!eq(crop(coverageBefore),bytes(payload.referenceCoverage)))throw Error('inject source/reference mismatch');
        const make=text=>{const r=bytes(text),a=new Uint8Array(1024*1024*4);for(let y=0;y<roi.h;y++)a.set(r.subarray(y*roi.w*4,(y+1)*roi.w*4),((offsetY+y)*1024+offsetX)*4);return a};
        const P=make(payload.P),C=make(payload.C),active=gl.getParameter(gl.ACTIVE_TEXTURE),binding=gl.getParameter(gl.TEXTURE_BINDING_2D),flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premultiply=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),alignment=gl.getParameter(gl.UNPACK_ALIGNMENT);
        try{gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);own.strokeInk.writePixels(P);own.inkLoad.writePixels(P);own.strokeColor.writePixels(C);own.inkColor.writePixels(C)}finally{gl.activeTexture(active);gl.bindTexture(gl.TEXTURE_2D,binding);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,premultiply);gl.pixelStorei(gl.UNPACK_ALIGNMENT,alignment)}
        const uploaded={};for(const[name,b,expected]of[['strokeInk',own.strokeInk,P],['inkLoad',own.inkLoad,P],['strokeColor',own.strokeColor,C],['inkColor',own.inkColor,C]]){const full=b.readPixels();if(!eq(full,expected))throw Error('inject upload mismatch '+name);outsideZero(full);uploaded[name]=encode(crop(full))}
        if(!eq(own.coverage.readPixels(),coverageBefore))throw Error('inject coverage altered');
        globalThis.__wcInjectProof={roi,baseZero:true,blankOriginal:true,sourceReferenceExact:true,coverageUnchanged:true,uploaded,referenceCaptureSha256:payload.referenceCaptureSha256,modelSha256:payload.modelSha256,contactsRemoved:scratch.brushTravel.length};
        scratch.brushTravel=[];globalThis.__wcInjectDone=true;
        if(gl.getError()!==gl.NO_ERROR||gl.isContextLost())throw Error('inject GL/context');
      }catch(e){globalThis.__wcInjectFailure=String(e.stack||e);throw e}};
      const timingFB=gl.createFramebuffer(),timingTex=gl.createTexture(),oldFB=gl.getParameter(gl.FRAMEBUFFER_BINDING),oldTex=gl.getParameter(gl.TEXTURE_BINDING_2D);gl.bindTexture(gl.TEXTURE_2D,timingTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,timingFB);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,timingTex,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('timing FBO');gl.bindFramebuffer(gl.FRAMEBUFFER,oldFB);gl.bindTexture(gl.TEXTURE_2D,oldTex);
      const unitTimings=[],drain=()=>{const fb=gl.getParameter(gl.FRAMEBUFFER_BINDING);gl.bindFramebuffer(gl.FRAMEBUFFER,timingFB);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));gl.bindFramebuffer(gl.FRAMEBUFFER,fb)};
'''
s=s.replace('const draw = e.gl.drawArrays.bind(e.gl)',hook+'\n      const draw = e.gl.drawArrays.bind(e.gl)')
s=s.replace('if(composite){','''const role=program===e._stamps?.program?'source-dab':program===e._ribbonPasses._ribbonProg?'source-band':program===passes._brushDragProg?'brush':null;
        if(role&&unitTimings.filter(t=>t.role===role).length<8){drain();const st=performance.now();const value=draw(...args);drain();const ms=performance.now()-st;unitTimings.push({role,ms});if(ms>1000)throw Error('injection GPUunit>1sec');return value}
        if(composite){''')
s=s.replace("const start = performance.now()\n        while", "const start = performance.now()\n        while")
s=s.replace("if (performance.now() - start > 180000)","if(globalThis.__wcInjectFailure)throw Error(globalThis.__wcInjectFailure);if (performance.now() - start > 180000)")
s=s.replace('return { compositeFields,compositeLog,','if(unitTimings.filter(t=>t.role==="source-dab"||t.role==="source-band").length<8)throw Error("source timing guards unreachable");if(!globalThis.__wcInjectDone||!globalThis.__wcInjectProof||programDraws.brush!==0)throw Error("inject final guard");\n        return { injectionProof:globalThis.__wcInjectProof,unitTimings,compositeFields,compositeLog,')
s=s.replace('}, test)','}, {...test,injectionPayload})')
s=s.replace("const bytes = Buffer.from(result.png, 'base64');", "for(const[name,text]of Object.entries(result.injectionProof.uploaded)){result.injectionProof.uploaded[name]={sha256:createHash('sha256').update(Buffer.from(text,'base64')).digest('hex'),bytes:Buffer.from(text,'base64').length}};\n    const bytes = Buffer.from(result.png, 'base64');")
(out/'injection-render-v1.mjs').write_text(s)
