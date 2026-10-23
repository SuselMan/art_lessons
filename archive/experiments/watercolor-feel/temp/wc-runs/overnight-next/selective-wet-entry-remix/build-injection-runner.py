from pathlib import Path
p=Path('temp/wc-runs/overnight-next/selective-wet-entry-remix');s=(p/'wet-context-stage-probe-v3.mjs').read_text()
a="mkdirSync(output, { recursive: true })"
b="""const modelDir=process.env.QA_MODEL_DIR;if(!modelDir)throw Error('MODEL manifest directory required');
const modelManifest=JSON.parse(readFileSync(modelDir+'/model-manifest.json','utf8'));const injectionMode=process.env.QA_INJECT_MODE||'verify-only';if(!['verify-only','identity','balanced'].includes(injectionMode))throw Error('Injection mode');
const payloadFor=id=>{const row=modelManifest.cases.find(c=>c.id===id);if(!row)throw Error('Model case absent');const files={};for(const [role,record]of Object.entries(row.records)){const raw=readFileSync(modelDir+'/'+record.file);if(createHash('sha256').update(raw).digest('hex')!==record.sha256)throw Error('Model SHA '+role);files[role]=raw.toString('base64')}return{...row,files,injectionMode}};
"""+a
assert s.count(a)==1;s=s.replace(a,b)
a="      const fo=passes.fieldOp.bind(passes);"
b="""      let injectionProof=null;const injectModel=()=>{if(!captureEligible)return;if(injectionProof)throw Error('Multiple model injection');const pay=test.modelPayload;if(!pay||JSON.stringify(mapping)!==JSON.stringify(pay.mapping)||field.w!==pay.width||field.h!==pay.height)throw Error('Model mapping mismatch');
        const buffers={P:lastBrushDep,C:lastBrushCol,V:field.coverage};if(!buffers.P||!buffers.C||buffers.P===buffers.C||buffers.P===buffers.V||buffers.C===buffers.V)throw Error('Model stable aliases');
        const oldFB=gl.getParameter(gl.FRAMEBUFFER_BINDING),oldRB=gl.getParameter(gl.RENDERBUFFER_BINDING),active=gl.getParameter(gl.ACTIVE_TEXTURE),binding=gl.getParameter(gl.TEXTURE_BINDING_2D),flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premult=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),alignment=gl.getParameter(gl.UNPACK_ALIGNMENT),pack=gl.getParameter(gl.PACK_ALIGNMENT),clear=gl.getParameter(gl.COLOR_CLEAR_VALUE);
        const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));const eq=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);const sums=a=>{const r=[0,0,0,0];for(let i=0;i<a.length;i++)r[i%4]+=a[i];return r};
        try{const expectedP=decode(pay.files.beforeP),expectedC=decode(pay.files.beforeC),expectedV=decode(pay.files.coverage);const actualP=buffers.P.readPixels(),actualC=buffers.C.readPixels(),actualV=buffers.V.readPixels();if(!eq(actualP,expectedP)||!eq(actualC,expectedC)||!eq(actualV,expectedV))throw Error('Model original stable bytes mismatch');
          const targetP=pay.injectionMode==='balanced'?decode(pay.files.modelP):expectedP,targetC=pay.injectionMode==='balanced'?decode(pay.files.modelC):expectedC;if(targetP.length!==actualP.length||targetC.length!==actualC.length||!eq(sums(targetP),sums(actualP))||!eq(sums(targetC),sums(actualC)))throw Error('Model all8 sums mismatch');
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);if(pay.injectionMode!=='verify-only'){buffers.P.writePixels(targetP);buffers.C.writePixels(targetC)}
          if(!eq(buffers.P.readPixels(),targetP)||!eq(buffers.C.readPixels(),targetC)||!eq(buffers.V.readPixels(),expectedV))throw Error('Model readback or coverage mismatch');
          injectionProof={mode:pay.injectionMode,case:pay.id,mapping:{...mapping},width:field.w,height:field.h,originalExact:true,all8SumsExact:true,coverageExact:true,settleNo,brushCount,records:pay.records,changedBytes:targetP.reduce((n,v,i)=>n+(v!==actualP[i]),0)+targetC.reduce((n,v,i)=>n+(v!==actualC[i]),0),scope:'FIXTURE ONLY CPU fullfield injection before tide; not engine solver/live implementation'};
        }finally{gl.bindFramebuffer(gl.FRAMEBUFFER,oldFB);gl.bindRenderbuffer(gl.RENDERBUFFER,oldRB);gl.activeTexture(active);gl.bindTexture(gl.TEXTURE_2D,binding);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,premult);gl.pixelStorei(gl.UNPACK_ALIGNMENT,alignment);gl.pixelStorei(gl.PACK_ALIGNMENT,pack);gl.clearColor(...clear)}
      };
"""+a
assert s.count(a)==1;s=s.replace(a,b)
a="brushPending=false}if([15,16]";b="brushPending=false;injectModel()}if([15,16]";assert s.count(a)==1;s=s.replace(a,b)
s=s.replace('return { unmeasuredStages,brushUnitBudget',"if(!injectionProof)throw Error('Model injection hook unreachable');return { injectionProof,unmeasuredStages,brushUnitBudget")
s=s.replace('    }, test)','    }, {...test,modelPayload:payloadFor(test.id)})')
s=s.replace("if (!bytes.equals(expectedPNGFor(test.id))) throw Error('Wet-context instrumentation PNG differs from cached source23')","if ((injectionMode!=='balanced'||test.id==='s3-n1')&&!bytes.equals(expectedPNGFor(test.id))) throw Error('Model identity/noop PNG differs from cached source23')")
s=s.replace("variant: candidateId, parent: variant, experimentSha256", "variant: candidateId, modelMode:injectionMode,modelManifestSha256:createHash('sha256').update(readFileSync(modelDir+'/model-manifest.json')).digest('hex'), parent: variant, experimentSha256")
(p/'fixture-model-injection-v1.mjs').write_text(s)
