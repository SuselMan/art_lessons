import json, hashlib
from pathlib import Path
from PIL import Image
import numpy as np
root=Path('temp/history-parity')
a=root/'preparation-bootstrap-diagnostic';b=root/'preparation-corrected-candidate'
ar=json.loads((a/'report.json').read_text());br=json.loads((b/'report.json').read_text())
def pixels(x,y):
 p=np.asarray(Image.open(x).convert('RGBA')).astype(np.int16);q=np.asarray(Image.open(y).convert('RGBA')).astype(np.int16)
 d=np.abs(p-q);return {'changedPixels':int(np.any(d,axis=2).sum()),'max':int(d.max()),'over8':int(np.any(d>8,axis=2).sum())}
ra=ar['replay'];rb=br['replay']
fields=[]
for i,(x,y) in enumerate(zip(ra['stages'],rb['stages'])):
 fields.append({'stage':i,'fullFieldsEqual':all(t.get('full')==u.get('full') for t,u in zip(x['fields'],y['fields'])),'roiBytesEqual':all(t.get('fields')==u.get('fields') for t,u in zip(x['fields'],y['fields'])),'logicalEqual':x['logical']==y['logical'],'ctxEqual':x['ctx']==y['ctx'],'tilesEqual':len(x['fields'])==len(y['fields'])})
r={'journalExact':ar['journal']==br['journal'],'baselineStages':len(ra['stages']),'candidateStages':len(rb['stages']),'commandsEqual':ra['commands']==rb['commands'],'commands':[len(ra['commands']),len(rb['commands'])],'fixedReplayPixels':pixels(a/'fixed-replay.png',b/'fixed-replay.png'),'baselineNativeRebuild':pixels(a/'native.png',a/'rebuild.png'),'candidateNativeRebuild':pixels(b/'native.png',b/'rebuild.png'),'stages':fields,'gl':[ra['gl'],rb['gl']],'lost':[ra['lost'],rb['lost']],'closed':[ar['chromeClosed'],br['chromeClosed']]}
(root/'preparation-corrected-comparison.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
