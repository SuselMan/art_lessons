import pathlib
p=pathlib.Path('temp/wc-runs/overnight-next/depth-quantization-audit');s=(p/'paired-phase-probe-seven.mjs').read_text();s=s.replace('let afterCarryCaptured=false,lastFixedPhysical=null;','let afterCarryCaptured=false,lastFixedPhysical=null,mobileP=null,mobileC=null,splitCaptured=false,remobCaptured=false;')
a=s.index("        const accepted=");b=s.index('        if(!mapping||!field)',a)
s=s[:a]+'''        const accepted=['source-input','source-color','after-split','after-carry','after-remob-before-diffuse','post-settle-combined-before-brush','brush-final-stable-before-next-field-op'];
        if(!accepted.includes(stage))return;
        if(stage==='source-input')stageFrames.length=0;
        if(stage==='source-input')buffers={pigment:buffers.source};
        if(stage==='source-color')buffers={color:buffers.color};
        if(stage==='post-settle-combined-before-brush'||stage==='brush-final-stable-before-next-field-op')buffers={pigment:buffers.pigment,color:buffers.color};
'''+s[b:]
s=s.replace('>8)', '>12)').replace('Fullfield8record','Fullfield12record')
s=s.replace('settleNo++;afterCarryCaptured=false;', 'settleNo++;mobileP=null;mobileC=null;splitCaptured=false;remobCaptured=false;afterCarryCaptured=false;')
s=s.replace("capture('after-carry',{pigment:aa,fixed:bb}","capture('after-carry',{pigment:aa,color:mobileC}")
s=s.replace("const r=fo(...a);modeCounts", "if([15,16].includes(mode)&&!splitCaptured){capture('after-split',{pigment:mobileP,color:mobileC});splitCaptured=true}const r=fo(...a);modeCounts")
s=s.replace("lastFixedPhysical=bb;capture('source-input',{source:aa})", "lastFixedPhysical=bb;mobileP=out;capture('source-input',{source:aa})")
s=s.replace("if([11,17,18].includes(mode)", "if(mode===0&&modeCounts[0]===2){mobileC=out;capture('source-color',{color:aa})}\n        if([11,17,18].includes(mode)")
s=s.replace("capture('after-carry',{pigment:a[6],fixed:lastFixedPhysical}", "capture('after-carry',{pigment:a[6],color:mobileC}")
s=s.replace('const r=ds(...a);diffuseCount++;', "if(!remobCaptured){capture('after-remob-before-diffuse',{pigment:a[6],color:mobileC});remobCaptured=true}const r=ds(...a);diffuseCount++;")
s=s.replace("const required=['source-input','after-carry','after-fine-before-brush','after-brush-stable'];", "const required=['source-input','source-color','after-split','after-carry','after-remob-before-diffuse','after-fine-before-brush','after-brush-stable'];")
s=s.replace('result.stageFrames.length!==8','result.stageFrames.length!==12')
s=s.replace('Expected four phases plus fixed, commoncoverage and paired pre/postbrush colors snapshots','Expected six paired phases (source split carries separate source-color tag), max12 records')
(p/'paired-phase-probe-seven-rich.mjs').write_text(s)
