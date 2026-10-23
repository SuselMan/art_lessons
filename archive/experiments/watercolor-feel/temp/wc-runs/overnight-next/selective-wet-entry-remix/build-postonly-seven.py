from pathlib import Path
import json,hashlib
p=Path('temp/wc-runs/overnight-next/selective-wet-entry-remix');f=p.parent/'foreign-puddle-source-audit/inputs-three.json';i=json.loads(f.read_text());i['cases']=[c for c in i['cases']if c['id']=='s7-n3'];assert len(i['cases'])==1;dst=p/'stage-seven-inputs.json';dst.write_text(json.dumps(i,indent=2));sha=hashlib.sha256(dst.read_bytes()).hexdigest()
s=(p/'wet-context-stage-probe-v3.mjs').read_text();s=s.replace("if(input.cases.length!==2||!['s3-n1','s4-n1'].every(id=>input.cases.some(c=>c.id===id)))throw Error('Wet context scope exactly3/1+4/1');","if(input.cases.length!==1||input.cases[0].id!=='s7-n3')throw Error('POSTONLY V4 scope exactly7/3');").replace('258bd6426c5d2ad755d0d1921442da3377991b10004a959226472dbc44a1f005',sha)
s=s.replace("const accepted=['source-input','source-color','after-split','after-carry','after-remob-before-diffuse','post-settle-combined-before-brush','brush-final-stable-before-next-field-op'];","const accepted=['post-settle-combined-before-brush','brush-final-stable-before-next-field-op'];")
a="          const oldFB=gl.getParameter(gl.FRAMEBUFFER_BINDING),fb=gl.createFramebuffer();try{for(const tile of args[0])"
start=s.index(a);end=s.index('\n        }\n\n        try{const result=prepare',start);s=s[:start]+s[end:]
start=s.index("    const required=['source-input'");end=s.index('    for(const f of result.stageFrames)',start)
s=s[:start]+'''    if(result.stageFrames.length!==6)throw Error('POSTONLY V4 requires exactly6records');
    for(const stage of ['after-fine-before-brush','after-brush-stable'])for(const role of ['pigment','color','coverage'])if(!result.stageFrames.some(f=>f.stage===stage&&f.role===role))throw Error('POSTONLY missing '+stage+'/'+role);
    if(result.operationContexts.length!==1||result.operationContexts.some(c=>c.landedWetArg!==c.finishContextLandedWet))throw Error('POSTONLY actual context closure');
'''+s[end:]
s=s.replace('Latest source-bearing settle; paired pre/postbrush physical and optical depth phases; decodeP2/depth8, quantization-loss audit','POSTONLY V4 latest7 mixed settle; exactly6 stable pre/postbrushP/C/coverage, observed landedWet; decodeP2/depth8')
(p/'wet-context-postonly-seven-v4.mjs').write_text(s)
plan={'runner':'wet-context-postonly-seven-v4.mjs','runnerSha256':hashlib.sha256(s.encode()).hexdigest(),'inputSha256':sha,'originalFullInputsSha256':hashlib.sha256(f.read_bytes()).hexdigest(),'expectedPNG':'physical22-enteredwater-source-three/s7-n3.png','scope':'READONLY instrumentation source23; exactly6 mandatory records before/after brush allP/C/cov; no earlysource or CPU solver','approval':'PENDING ROOT; NO GPU'};(p/'postonly-seven-v4-plan.json').write_text(json.dumps(plan,indent=2))
q=p/'pending-targeted-publication/config-draft.json';cfg=json.loads(q.read_text());cfg['comparisons']=[c for c in cfg['comparisons']if c['case']=='s4-n1'];cfg['description']='Два сравнения прохода кистью через мокрую область. Второе — визуализация отдельной вычисленной модели, а не готовая версия движка. Фото — ориентир.';q.write_text(json.dumps(cfg,indent=2))
