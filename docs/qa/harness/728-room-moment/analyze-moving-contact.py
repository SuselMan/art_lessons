"""Only source ROI dose/structure; not a dry-picture or artistic judgement."""
import hashlib,importlib.util,json,pathlib,sys
spec=importlib.util.spec_from_file_location('factors',pathlib.Path(__file__).with_name('analyze-held-factors.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
r=pathlib.Path(sys.argv[1]);report=json.loads((r/'report.json').read_text())
if not report.get('valid')or len(report.get('arms',[]))!=2:raise ValueError('Invalid paired capture')
if report['arms'][0]['commandSha256']!=report['arms'][1]['commandSha256']:raise ValueError('Inputs differ')
fields={};out={}
for arm in report['arms']:
 if arm['roi']!={'x':272,'yTop':352,'w':384,'h':192}:raise ValueError('ROI mismatch')
 for g in arm['groups']:
  b=(r/f"{arm['variant']}-{g['name']}.rgba").read_bytes()
  if len(b)!=294912 or hashlib.sha256(b).hexdigest()!=g['sha256']:raise ValueError('Payload SHA/size mismatch')
  fields[arm['variant'],g['name']]=b
for name in ['coverage','P','C']:
 a=fields['literal',name];b=fields['A',name];out[name]={'allRGBA':m.difference(a,b),'channels':[{'channel':i,'literalSum':sum(a[i::4]),'ASum':sum(b[i::4]),'delta':sum(b[i::4])-sum(a[i::4]),'diff':m.difference(a[i::4],b[i::4])}for i in range(4)]}
 for variant in ['literal','A']:
  data=fields[variant,name]
  for channel in range(4):m.png(r/f'{variant}-{name}-{channel}.png',384,192,list(data[channel::4]))
for variant in ['literal','A']:
 pb=fields[variant,'P'][2::4];cov=fields[variant,'coverage'][3::4]
 out[variant]={'zeroPBWithCoverage255':sum(v==0 and c==255 for v,c in zip(pb,cov)),'nonzeroPB':sum(v>0 for v in pb),'nonzeroCoverage':sum(v>0 for v in cov)}
out['scope']='ROI only, no expected exact across new models, same CPU recipes; source Q8 stages only, not settle/live input/Room/replay/UX.'
(r/'moving-analysis.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
