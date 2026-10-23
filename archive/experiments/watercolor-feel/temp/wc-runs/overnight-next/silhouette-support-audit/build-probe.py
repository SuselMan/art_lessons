from pathlib import Path
import json
r=Path(__file__).parent;src=(r.parent/'stage-frequency-audit/phase-probe.mjs').read_text()
lo=src.index('      const capture=(stage, buffers, extra={})=>{');hi=src.index('      const prepare=',lo)
capture="""      const capturedSupport = new Set();
      const capture=(stage, buffers, extra={})=>{
        const latest = settleNo === test.ops.length;
        let selected=null;
        if(stage==='support-first-source' && test.ops.length>1 && settleNo===1) selected={coverage:buffers.coverage};
        if(latest && stage==='support-source') selected={pigment:buffers.pigment,coverage:buffers.coverage};
        if(latest && stage==='support-front-domain') selected={coverage:buffers.coverage};
        if(latest && stage==='support-dome-gate') selected={gate:buffers.gate,dome:buffers.dome};
        if(latest && stage==='support-final-stable') selected={pigment:buffers.pigment,coverage:buffers.coverage};
        if(!selected||capturedSupport.has(stage))return;
        capturedSupport.add(stage);
        if(!mapping||!field)throw Error('Support mapping missing');
        if(field.w>1536||field.h>1536||stageFrames.length+Object.keys(selected).length>8)throw Error('Support eight-record/canonical budget');
        const old=gl.getParameter(gl.FRAMEBUFFER_BINDING),fb=gl.createFramebuffer();
        try{for(const[role,b]of Object.entries(selected)){
          if(!b||b.width!==field.w||b.height!==field.h)throw Error('Support actual buffer size/identity missing');
          gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,b.texture,0);
          if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Support FBO');
          const bytes=new Uint8Array(b.width*b.height*4);gl.readPixels(0,0,b.width,b.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
          stageFrames.push({stage,role,settleNo,bufferId:id(b),mapping:{...mapping},width:b.width,height:b.height,orientation:'GLbottomup',pixelArea:mapping.S*mapping.S,rgba:encode(bytes),...extra});
        }}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,old);gl.deleteFramebuffer(fb)}
      };
"""
src=src[:lo]+capture+src[hi:]
lo=src.index('      const fo=passes.fieldOp.bind(passes);');hi=src.index('      let lastDiffuse=',lo)
hook="""      const fo=passes.fieldOp.bind(passes);const modeCounts={};
      passes.fieldOp=(...a)=>{
        const[out,aa,bb,mode,k,opts={}]=a;
        if(brushPending){capture('support-final-stable',{pigment:lastBrushDep,coverage:field.coverage},{brushCount,trigger:'after all paired copybacks, before next fieldOp',lastBrushScissor,lastBrushRect});brushPending=false}
        if(Object.keys(modeCounts).length===0){
          capture('support-first-source',{coverage:field.coverage},{trigger:'after stitch before FIRST fieldOp/source transport'});
          capture('support-source',{pigment:field.a,coverage:field.coverage},{trigger:'after stitch before FIRST fieldOp/source transport',fixedId:id(field.b)});
        }
        const result=fo(...a);modeCounts[mode]=(modeCounts[mode]||0)+1;
        stageEvents.push({stage:'fieldOp',settleNo,mode,k,out:id(out),a:id(aa),b:id(bb),d:id(opts.d)});
        if(mode===11)capture('support-front-domain',{coverage:out},{trigger:'immediately aftermode11 actual coverage output',frontCostId:id(opts.d)});
        if(mode===17)capture('support-dome-gate',{gate:out,dome:opts.d},{trigger:'immediately aftermode17 coverage.b*dome.a; not free fluid mass'});
        return result;
      };
"""
src=src[:lo]+hook+src[hi:]
src=src.replace("if(brushCount)capture('post-settle-pressure-role-unknown',{pressure:field.pressure,coverage:field.coverage},{brushCount,warning:'Pressure reused; not final physical pigment'});","if(brushPending){capture('support-final-stable',{pigment:lastBrushDep,coverage:field.coverage},{brushCount,trigger:'after idle fallback before dryAll'});brushPending=false;}")
(r/'support-probe.mjs').write_text(src)
inp=json.load(open(r.parent/'inputs.json'));inp['cases']=[c for c in inp['cases']if c['id']in['s4-n1','s9-n3','s6-n6']];(r/'support-inputs.json').write_text(json.dumps(inp,indent=2))
