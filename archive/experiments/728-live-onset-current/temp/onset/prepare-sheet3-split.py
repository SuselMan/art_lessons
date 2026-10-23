from pathlib import Path
p=Path('temp/onset/sheet3-mask-function.js');s=p.read_text()
s=s.replace("let e,owner=null", "const raw=new Map();let rawSerial=0;window.__maskSolverPartial=out;\n let e,owner=null")
s=s.replace('rgba:b64(a)', 'rawKey:(()=>{const key=String(++rawSerial);raw.set(key,a);return key})(),byteLength:a.length')
start=s.index('  for(const op of input.ops)')
end=s.index('\n }catch(err)',start)
s=s[:start]+'''  const targetIndex=input.ops.findIndex(op=>op.id===input.targetId);if(targetIndex<0)throw Error('Missing target');
  let expected='prefix',busy=false;const cleanup=()=>{for(const f of undo.reverse())f();undo.length=0;if(e)e.destroy();canvas.remove();delete window.__stageEngine;out.engineClosed=true;raw.clear()};
  const run=async phase=>{
   if(busy||phase!==expected)throw Error('Split stage order '+phase+'/'+expected);busy=true;
   try{
    const list=phase==='prefix'?input.ops.slice(0,targetIndex):phase==='target'?[input.ops[targetIndex]]:phase==='suffix'?input.ops.slice(targetIndex+1):[];
    for(const op of list){currentOp=op;window.__maskSolverPhase={phase,seq:op.seq,type:op.type,id:op.id};e.appendOperation(structuredClone(op),'remote');await idle();}
    if(phase==='suffix'){e.appendOperation(input.finalDry,'remote');await idle();e.setCompositeOrder(input.strokeLayers.filter(id=>e._layers.has(id)).map(id=>({id,opacity:1})));}
    if(phase==='export'){window.__maskSolverPhase={phase:'export'};const png=await e.exportPNG(false);out.final=await new Promise(r=>{const f=new FileReader;f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(png)});}
    out.flags={costPaths:input.costPaths,phase:plan.diagnosticPlateauPhase,baked:e._wcGradientFibres,rebase:e._wcSourceFilmRebase,async:e._wcAsyncFinish,opDry:e._wcAb.opDry,partial:plan.diagnosticPartialFrontPreview??false};
    out.journal=e._log.entries.map(x=>({id:x.op.id,type:x.op.type,state:x.state,seq:x.serverSeq??null}));const debug=e.gl.getExtension('WEBGL_debug_renderer_info');out.renderer=debug?e.gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):e.gl.getParameter(e.gl.RENDERER);out.gl=e.gl.getError();out.lost=e.gl.isContextLost();out.stageCount=stage;
    expected=({prefix:'target',target:'suffix',suffix:'export',export:'done'})[phase];window.__maskSolverPhase={phase:phase+'-done',expected,planes:out.planes.length};return {phase,expected,gl:out.gl,lost:out.lost,guards:out.guards,planes:out.planes.length};
   }catch(error){out.error=String(error);throw error}finally{busy=false}
  };
  window.__maskSolverSession={out,raw,run,dispose:cleanup,chunk:(key,offset,size)=>{const bytes=raw.get(key);if(!bytes)throw Error('Missing raw key');return b64(bytes.subarray(offset,offset+size));}};
  window.__maskSolverPhase={phase:'setup-done',expected};return {ready:true,targetIndex,totalOps:input.ops.length,rawBytes:0};''' +s[end:]
s=s.replace("finally{for(const f of undo.reverse())f();if(e)e.destroy();canvas.remove();delete window.__stageEngine;out.engineClosed=true;}","finally{if(!window.__maskSolverSession){for(const f of undo.reverse())f();if(e)e.destroy();canvas.remove();delete window.__stageEngine;out.engineClosed=true;}}")
Path('temp/onset/sheet3-mask-split-function.js').write_text(s)
