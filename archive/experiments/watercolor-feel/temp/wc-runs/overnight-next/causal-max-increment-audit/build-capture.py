import json,pathlib
r=pathlib.Path('temp/wc-runs/overnight-next');o=r/'causal-max-increment-audit';s=json.loads((r/'causal-max-audit/causal-physical22-max-zero-r8.json').read_text());ps=s['runtimePatches'];roi=json.loads((o/'source-roi.json').read_text())['roi'];p=next(p for p in ps if 'MAX lifecycle/paint guard' in p.get('after',''));before=p['after'];frag=f'''return {{ops, finish: () => {{
      finish();
      try {{
        globalThis.__wcRawPrefixes ??= [];
        if(globalThis.__wcRawPrefixes.length>=4)throw Error('Rawprefix max4');
        if(globalThis.__wcMaxMode!=='zero'||overlaps.length!==1)throw Error('Rawprefix requiresZERO singleTile');
        const tile=overlaps[0].tile, own=scratch.peek(tile.buffer), roi={json.dumps(roi)};
        const tx=roi.x-tile.originX, ty=tile.buffer.height-(roi.y+roi.h-tile.originY);
        if(tx<0||ty<0||tx+roi.w>tile.buffer.width||ty+roi.h>tile.buffer.height||roi.w>512||roi.h>512)throw Error('Rawprefix fixedROI bounds');
        const encode=(buf)=>{{const prior=gl.getParameter(gl.FRAMEBUFFER_BINDING);const bytes=new Uint8Array(roi.w*roi.h*4);try{{gl.bindFramebuffer(gl.FRAMEBUFFER,buf._fbo);gl.readPixels(tx,ty,roi.w,roi.h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);}}finally{{gl.bindFramebuffer(gl.FRAMEBUFFER,prior);}}let b='';for(let j=0;j<bytes.length;j+=8192)b+=String.fromCharCode(...bytes.subarray(j,j+8192));return btoa(b);}};
        globalThis.__wcRawPrefixes.push({{roi,orientation:'bottom-up',group:globalThis.__wcRawPrefixes.length,P:encode(own.strokeInk),C:encode(own.strokeColor),coverage:encode(own.coverage),gesture:scratch.gesture,contactEnd:globalThis.__wcMaxContacts.length}});
      }}catch(err){{globalThis.__wcRawCaptureFailure=String(err?.stack||err);throw err;}}
    }}}};'''
after=before.replace('return {ops, finish};',frag);assert before!=after
ps.append(dict(kind='vite-module-exact',module=p['module'],before=before,after=after,countPerResponse=1));p2=next(p for p in ps if "globalThis.__wcMaxGroups = 32" in p.get('after',''));ps.append(dict(kind='vite-module-exact',module=p2['module'],before='globalThis.__wcMaxGroups = 32;',after='globalThis.__wcMaxGroups = 4;',countPerResponse=1))
s=dict(id='physical22-raw-max-prefix-four-capture',parent='baseline',baseEngine='7ca4cf5d',runtimePatches=ps,scope='ONE nine prefix47originaldabs 4groups, fixed129x96 ROI, rawZERO only; no inferred raw from finalfields',limits={'groups':4,'sourceRecords':8,'coverageRecords':4,'readbackBytes':roi['w']*roi['h']*4*12},proof='R8 ZERO has no interim brush, source filmcopy identity pathway. Capture actual raw strokeInk/Color AFTER each fastfinish, before normal finalsettle. Require channelwise monotonic raw prefixes CPU later; no preclaim.',risks=['ZERO copy identity requires observed raw prefix monotonicity; groupcaps/bridges may still differ original one-shot.','Captured contacts and raw buffers real, no CPU approximate raster synthesis.'])
(o/'raw-prefix-four-capture.json').write_text(json.dumps(s,indent=2)+'\n')
a=(r/'causal-max-audit/render.mjs').read_text().replace("if (performance.now() - start > 180000)","if(globalThis.__wcRawCaptureFailure)throw Error(globalThis.__wcRawCaptureFailure);\n          if (performance.now() - start > 180000)")
a=a.replace('return { maxProof:',"if(globalThis.__wcRawCaptureFailure)throw Error(globalThis.__wcRawCaptureFailure);if(globalThis.__wcRawPrefixes?.length!==4)throw Error('Expected4 rawprefixes');\n        return { rawPrefixes:globalThis.__wcRawPrefixes, rawContacts:globalThis.__wcMaxContacts.map(c=>({...c,field:{...c.field,pixels:Array.from(c.field.pixels)}})), maxProof:")
a=a.replace("const bytes = Buffer.from(result.png, 'base64');", "writeFileSync(output+'/raw-prefix-capture.json',JSON.stringify({prefixes:result.rawPrefixes,contacts:result.rawContacts}));delete result.rawPrefixes;delete result.rawContacts;\n    const bytes = Buffer.from(result.png, 'base64');")
(o/'capture-render.mjs').write_text(a)
