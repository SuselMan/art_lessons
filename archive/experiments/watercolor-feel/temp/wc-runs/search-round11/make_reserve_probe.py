from pathlib import Path

root=Path.cwd()
p=root/'temp/wc-runs/search-round11'
s=(root/'scripts/strokes/search_render.mjs').read_text()
s=s.replace("new URL('../../package.json', import.meta.url)",repr(str(root/'package.json')))
s=s.replace('let draws = 0','let draws = 0; const reserveProbes = []')
before='''if (program === e._brushDragProg) { draws++; programDraws.brush++ }'''
after='''if (program === e._brushDragProg) {
          const gl=e.gl, oldUnit=gl.getParameter(gl.ACTIVE_TEXTURE);
          gl.activeTexture(gl.TEXTURE0); const paintTexture=gl.getParameter(gl.TEXTURE_BINDING_2D);
          gl.activeTexture(gl.TEXTURE3); const pigmentTexture=gl.getParameter(gl.TEXTURE_BINDING_2D);
          gl.activeTexture(oldUnit);
          const enabled=gl.getUniformLocation(program, 'u_fixedEnabled');
          const probe = paintTexture===pigmentTexture && enabled && gl.getUniform(program,enabled)>0;
          if (probe) {
            const box=gl.getParameter(gl.SCISSOR_BOX), oldFB=gl.getParameter(gl.FRAMEBUFFER_BINDING);
            const fixedLocation=gl.getUniformLocation(program,'u_fixed');
            const unit=gl.getUniform(program,fixedLocation);
            gl.activeTexture(gl.TEXTURE0+unit); const fixedTexture=gl.getParameter(gl.TEXTURE_BINDING_2D);
            const fb=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
            gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,fixedTexture,0);
            if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw Error('Reserve probe incomplete FBO');
            const fixed=new Uint8Array(box[2]*box[3]*4);
            gl.readPixels(box[0],box[1],box[2],box[3],gl.RGBA,gl.UNSIGNED_BYTE,fixed);
            gl.bindFramebuffer(gl.FRAMEBUFFER,oldFB); gl.deleteFramebuffer(fb); gl.activeTexture(oldUnit);
            draw(...args);
            const actual=new Uint8Array(fixed.length);
            gl.readPixels(box[0],box[1],box[2],box[3],gl.RGBA,gl.UNSIGNED_BYTE,actual);
            let maxViolation=0, countAboveOneLSB=0, fixedPixels=0;
            for(let i=3;i<actual.length;i+=4) {
              const a=fixed[i]/255;
              let fraction=0.45;
              if(window.__reserveProbeCandidate==='reserve70') fraction=0.70;
              if(window.__reserveProbeCandidate==='reserve-density' || window.__reserveProbeCandidate.startsWith('reserve-mobile-')) {
                const t=Math.max(0,Math.min(1,(a-0.25)/(0.8-0.25)));
                fraction=0.15+0.65*t*t*(3-2*t);
              }
              const violation=Math.max(0,a*fraction-actual[i]/255);
              maxViolation=Math.max(maxViolation,violation);
              if(violation>1/255+1e-7)countAboveOneLSB++;
              if(a>0)fixedPixels++;
            }
            reserveProbes.push({draw:draws,box:Array.from(box),fixedPixels,maxViolation,maxViolationLSB:maxViolation*255,countAboveOneLSB});
            draws++; programDraws.brush++;
            return;
          }
          draws++; programDraws.brush++;
        }'''
assert s.count(before)==1
s=s.replace(before,after)
needle="await page.goto(process.env.APP_URL || 'https://localhost:5277/create')"
assert s.count(needle)==1
s=s.replace(needle,"await page.addInitScript(id => { window.__reserveProbeCandidate=id }, candidateId)\n  "+needle)
needle='return { png: btoa(binary), gpu, draws,'
assert s.count(needle)==1
s=s.replace(needle,'return { png: btoa(binary), gpu, reserveProbes, draws,')
(p/'reserve-probe-render.mjs').write_text(s)
print('Created read-only per-deposit-pass reserve probe; run with reserve45/reserve70/reserve-density JSON only.')
