import pathlib,json
r=pathlib.Path('temp/wc-runs/overnight-next/nib-wake-audit')
for name in ['compact','aspect-damped-control']:
 p=r/f'production-strong80-nib-wake-{name}.json';s=json.loads(p.read_text());s['id']+='-instrumented-v1';s['runtimePatches'].append(dict(kind='vite-module-exact',module='/src/engine/src/watercolor/brushDrag.ts',before='\treturn contacts;\n}',after='''\tconst contactAudit = contacts.map(cf => ({rect:{...cf.rect},radius:cf.radius,width:cf.field.width,height:cf.field.height,B:Array.from(cf.field.pixels).filter((_,i)=>i%4===2)}));
\t(globalThis.__wcNibWakeContactB || (globalThis.__wcNibWakeContactB=[])).push(contactAudit);
\treturn contacts;
}''',countPerResponse=1,semanticFamily='nib-wake-contact-B-instrumentation'))
 (r/f"{s['id']}.json").write_text(json.dumps(s,indent=2))
body=pathlib.Path('temp/wc-runs/overnight-next/calibrated-systematic-strength/paired-strength-v2-probe.mjs').read_text()
body=body.replace("['s9-n3','s7-n3','s6-n6','s1-n1','s8-n1']","['s9-n3','s7-n3','s6-n6','s8-n1']")
body=body.replace('return { calibratedContactAudit, brushUnitBudget,', 'return { wakeAudit:{maxNorm:globalThis.__wcNibWakeMaxNorm,samples:globalThis.__wcNibWakeSamples,contacts:globalThis.__wcNibWakeContactB}, calibratedContactAudit, brushUnitBudget,')
anchor="    const required=['after-fine-before-brush','after-brush-stable'];"
extra='''    if(!result.wakeAudit || !(result.wakeAudit.samples>0) || !(result.wakeAudit.maxNorm<=1+1e-6) || !result.wakeAudit.contacts?.length)throw Error('Missing bounded wake/contact audit');
    result.wakeAudit.contactBHashes=result.wakeAudit.contacts.map(group=>group.map(cf=>{if(cf.B.length!==cf.width*cf.height)throw Error('Contact B bytes mismatch');return {rect:cf.rect,width:cf.width,height:cf.height,radius:cf.radius,Bsha256:createHash('sha256').update(Buffer.from(cf.B)).digest('hex')}}));
    writeFileSync(output+'/'+test.id+'-contact-B.json',JSON.stringify(result.wakeAudit.contacts));delete result.wakeAudit.contacts;
    result.wakeAudit.preBrushEqualityScope=['s9-n3','s8-n1'].includes(test.id)?'Expected exact versus matched strong80/control; compare offline':'Earlier operation transport can legitimately affect current total pre-brush fields; do not demand byte identity';
'''
assert body.count(anchor)==1;body=body.replace(anchor,extra+anchor)
(r/'paired-wake-probe-v1.mjs').write_text(body)
for name in ['compact','aspect-damped-control']:
 p=r/f'validate-{name}.mts';b=p.read_text().replace(f'production-strong80-nib-wake-{name}.json',f'production-strong80-nib-wake-{name}-instrumented-v1.json').replace(f'compiled-validation-{name}.json',f'compiled-validation-{name}-instrumented-v1.json');(r/f'validate-{name}-instrumented-v1.mts').write_text(b)
