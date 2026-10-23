from pathlib import Path
import json
p=Path('temp/wc-runs/search-round10')
s=Path('scripts/strokes/search_render.mjs').read_text()
s=s.replace("new URL('../../package.json', import.meta.url)","'/home/suselman/projects/pencil-agents/watercolor-feel/package.json'")
s=s.replace('let draws = 0','let draws = 0; const fluxProbes = []')
before='if (program === e._brushDragProg) { draws++; programDraws.brush++ }'
after='''if (program === e._brushDragProg) {
          if (draws % 40 === 0 && fluxProbes.length < 12) {
            const gl=e.gl, box=gl.getParameter(gl.SCISSOR_BOX);
            const oldFB=gl.getParameter(gl.FRAMEBUFFER_BINDING), oldUnit=gl.getParameter(gl.ACTIVE_TEXTURE);
            const read=(unit)=>{
              gl.activeTexture(gl.TEXTURE0+unit); const tex=gl.getParameter(gl.TEXTURE_BINDING_2D);
              const fb=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
              gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
              if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw Error('Probe incomplete FBO');
              const bytes=new Uint8Array(box[2]*box[3]*4);
              gl.readPixels(box[0],box[1],box[2],box[3],gl.RGBA,gl.UNSIGNED_BYTE,bytes);
              gl.bindFramebuffer(gl.FRAMEBUFFER,oldFB); gl.deleteFramebuffer(fb); return bytes;
            };
            const pigment=read(3), water=read(2); gl.activeTexture(oldUnit);
            let wet=0, sum=0, high80=0, high90=0, saturated=0, max=0;
            for(let i=0;i<pigment.length;i+=4) if(water[i+2]>=38) {
              const a=pigment[i+3]; wet++;sum+=a;max=Math.max(max,a);
              if(a>=204)high80++;if(a>=230)high90++;if(a>=250)saturated++;
            }
            fluxProbes.push({draw:draws,box:Array.from(box),wet,meanAlpha:wet?sum/wet/255:0,maxAlpha:max/255,high80,high90,saturated});
          }
          draws++; programDraws.brush++
        }'''
assert s.count(before)==1
s=s.replace(before,after).replace('return { png: btoa(binary), gpu, draws,','return { png: btoa(binary), gpu, fluxProbes, draws,')
(p/'probe-render.mjs').write_text(s)
x=json.loads((p/'inputs.json').read_text());x['cases']=[c for c in x['cases'] if c['id']=='s6-n6'];(p/'probe-inputs.json').write_text(json.dumps(x))
print('Read-only texture probe ready')
