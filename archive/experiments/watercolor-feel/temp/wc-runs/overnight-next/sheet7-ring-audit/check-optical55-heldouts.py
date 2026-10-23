from pathlib import Path
import json,hashlib,numpy as np
from PIL import Image,ImageDraw
n=Path(__file__).parent.parent;d=Path(__file__).parent;f=n/'symmetric-soft16-optical55-heldouts-three';r=json.loads((f/'report.json').read_text());s=json.loads((d/'actual-optical-gain55.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();assert r['complete']and not r['errors'];assert r['experimentSha256']==sha(d/'actual-optical-gain55.json');parents={'s6-n5':'optics-holdout-softshoulder16-three','s10-n3':'softshoulder16-critical-three','s1-n1':'softshoulder16-straight-control-one'};inputs=json.loads((d/'inputs-optical55-holdouts.json').read_text());canvas=Image.new('RGB',(1500,990),'white');draw=ImageDraw.Draw(canvas);rows=[]
for j,c in enumerate(r['cases']):
 cid=c['id'];p=n/parents[cid];pr=json.loads((p/'report.json').read_text());pc=next(x for x in pr['cases']if x['id']==cid);assert sha(p/(cid+'.png'))==pc['pngSha256'];assert sha(f/(cid+'.png'))==c['pngSha256'];assert c['error']==0 and not c['lost'];assert max(c['brushUnitBudget'],default=0)<1000
 for i,patch in enumerate(s['runtimePatches']):assert c['customReplacements'][i]>0 if patch['kind']=='shader-exact'else r['modulePatchCounts'][i]>0
 frames=json.loads((f/(cid+'-phase-fields.json')).read_text())['frames'];net={}
 for role in ['pigment','color']:
  a=next(x for x in frames if x['role']==role and x['stage']=='after-fine-before-brush');b=next(x for x in frames if x['role']==role and x['stage']=='after-brush-stable');net[role]=[y-x for x,y in zip(a['sumRGBA'],b['sumRGBA'])];assert all(v==0 for v in net[role])
 inp=next(x for x in inputs['cases']if x['id']==cid);old=Image.open(p/(cid+'.png')).crop(inp['box']);new=Image.open(f/(cid+'.png')).crop(inp['box']);delta=abs(np.array(old).astype(float)-np.array(new).astype(float));ref=Image.open(Path('docs/reference/strokes')/inp['reference'])if inp.get('reference')else Image.new('RGB',(480,295),'white')
 for k,(im,label)in enumerate(zip([ref,old,new],['reference'if inp.get('reference')else 'reference not supplied','parent plain soft16','symmetric + optical55'])):
  im.thumbnail((480,295));canvas.paste(im,(k*500+(480-im.width)//2,j*330+30));draw.text((k*500+5,j*330+5),cid+' '+label,fill='black')
 rows.append({'id':cid,'parentReport':str(p/'report.json'),'parentVariant':pr['variant'],'parentPNGsha':pc['pngSha256'],'candidatePNGsha':c['pngSha256'],'MAE':float(delta.mean()),'max':float(delta.max()),'latestBrushNetCodes':net,'unitMaxMs':max(c['brushUnitBudget'],default=0),'initialAlphaResidual':c['preAlphaMismatch']})
canvas.save(f/'contact.jpg',quality=92);(f/'independent-qc.json').write_text(json.dumps({'pass':True,'candidateReport':str(f/'report.json'),'variant':r['variant'],'source':r['sourceCommit'],'scope':'Package comparison symmetricexchange+optical55 versus plainsoft16; no isolated optics or final15sampler invariant claim.','cases':rows},indent=2));print(rows)
