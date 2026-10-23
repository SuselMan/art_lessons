from pathlib import Path
r=Path(__file__).parent;s=(r.parent/'silhouette-support-audit/support-probe-v5.mjs').read_text()
s=s.replace("['s9-n3','s6-n6','s4-n1'].includes(c.id)","['s9-n3'].includes(c.id)").replace("Support probe permits exact9/6/4 only","Postrelax probe exact9/3 only")
s=s.replace('let hookFailure=null;','let postCalls=0,firstPairStarted=null,firstPairMs=null,syncReads=0; let hookFailure=null;')
a=s.index('        let selected=null;');b=s.index('        if(!selected||',a)
s=s[:a]+"""        let selected=null;
        if(latest && stage==='support-source') selected={pigment:buffers.pigment,color:field.ca};
        if(latest && stage==='post-settle-combined-before-brush')selected={pigment:buffers.pigment,color:buffers.color,coverage:buffers.coverage};
        if(latest && stage==='postrelax-before')selected={pigment:buffers.pigment,color:buffers.color};
        if(latest && stage==='support-final-stable')selected={pigment:buffers.pigment,color:lastBrushCol,coverage:buffers.coverage};
"""+s[b:]
s=s.replace('>8)throw Error(\'Support eight-record/canonical budget\')','>10)throw Error(\'Postrelax ten-record/canonical budget\')')
# sourcecapture once + all beforehooks count2 input forbidden
a=s.index('      let lastDiffuse=null;');b=s.index('      const bp=',a)
s=s[:a]+"""      const syncPixel=()=>{
        const old=gl.getParameter(gl.FRAMEBUFFER_BINDING),fb=gl.createFramebuffer();
        try{gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,field.mask.texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Postrelax sync FBO');gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));syncReads++;}
        finally{gl.bindFramebuffer(gl.FRAMEBUFFER,old);gl.deleteFramebuffer(fb)}
      };
      const endFirstPair=()=>{if(postCalls>=2&&firstPairStarted!==null&&firstPairMs===null){syncPixel();firstPairMs=performance.now()-firstPairStarted;}};
      const ds=passes.diffuseStep.bind(passes);passes.diffuseStep=(...a)=>{
        field=a[0];mapping={x0:a[1],y0:a[2],S:a[3]};
        if(brushCount>0 && settleNo===1){
          if(postCalls===0){if(a[6]!==lastBrushCol || a[11]!==lastBrushDep)throw Error('Postrelax first colour/preP identity');
            capture('postrelax-before',{pigment:a[11],color:a[6]},{trigger:'before first post colour draw'});syncPixel();firstPairStarted=performance.now();}
          else if(postCalls===2)endFirstPair();
          if(postCalls%2===0 && (a[6]!==lastBrushCol || a[11]!==lastBrushDep))throw Error('Postrelax colour density pairing');
          if(postCalls%2===1 && (a[6]!==lastBrushDep || a[11]!==lastBrushDep))throw Error('Postrelax physical density pairing');
          postCalls++;
        }
        return ds(...a);
      };
"""+s[b:]
# whenbrushpendingstable beforeFO include GPU pair end
s=s.replace("if(brushPending){capture('support-final-stable'","if(brushPending){endFirstPair();capture('support-final-stable'")
s=s.replace('return { stageFrames,stageEvents,','return { postRelaxCalls:postCalls,postRelaxSweeps:globalThis.__wcPostRelax,firstPairMs,syncReads, stageFrames,stageEvents,')
a=s.index('    const latestNo=test.ops.length;');b=s.index('    for(const f of result.stageFrames){const data=',a)
s=s[:a]+"""    const expectedSweeps=Number(candidateId.match(/postrelax(1|2|4)$/)?.[1]);
    if(!expectedSweeps || result.postRelaxCalls!==2*expectedSweeps || result.postRelaxSweeps!==expectedSweeps || result.syncReads!==2 || !(result.firstPairMs>=0))throw Error('Postrelax exact sweep/timing reach guard');
    const required=[['support-source','pigment'],['support-source','color'],['post-settle-combined-before-brush','pigment'],['post-settle-combined-before-brush','color'],['post-settle-combined-before-brush','coverage'],['postrelax-before','pigment'],['postrelax-before','color'],['support-final-stable','pigment'],['support-final-stable','color'],['support-final-stable','coverage']];
    if(result.stageFrames.length!==10 || required.some(([stage,role])=>result.stageFrames.filter(f=>f.stage===stage&&f.role===role).length!==1))throw Error('Postrelax ten exact records');
    result.supportCaptureProof={required,recordCount:10};
"""+s[b:]
# windowcountercase reset
s=s.replace('const started = performance.now()','globalThis.__wcPostRelax=0; const started = performance.now()')
(r/'paired-phase-probe.mjs').write_text(s)
