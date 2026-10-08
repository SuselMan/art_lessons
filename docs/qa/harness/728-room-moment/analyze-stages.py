"""Offline exact Q8 pair oracle on captured interior (no hidden border input)."""
import json,pathlib,struct,sys
root=pathlib.Path(sys.argv[1]);meta=json.loads((root/'moment-stages.json').read_text());report=[]
for contact,r in enumerate(meta):
 stages=r['stages'];records=[]
 for s in stages[:5]:
  raw=(root/s['file']).read_bytes();records.append(list(struct.unpack('<'+str(len(raw)//4)+'I',raw)))
 w,h=stages[0]['width'],stages[0]['height'];checks=[]
 for step in range(4):
  before,actual=records[step],records[step+1];expected=before[:];axis,parity=step//2,step%2;offset=r['capture']['x' if axis==0 else 'y'];flow=r['recipe'];indices=[2,4,5,6,7]
  for y in range(h):
   for x in range(w):
    v=x if axis==0 else y;limit=w if axis==0 else h
    if (v+offset)%2!=parity or v+1>=limit:continue
    a=(y*w+x)*10;b=a+(10 if axis==0 else w*10);wet=min(before[a+8],before[b+8],before[a+9],before[b+9]);mix=wet*flow['mixRate']//255
    aa=[((255-mix)*before[a+j]+mix*before[b+j])//255 for j in indices];bb=[before[a+j]+before[b+j]-aa[k] for k,j in enumerate(indices)];direction=flow['directionX' if axis==0 else 'directionY'];forward=direction>=0;source,target=(aa,bb) if forward else (bb,aa);rate=(wet*flow['advectionRate']//255)*abs(direction)//256
    for k in range(5):
     if source[k]:rate=min(rate,(255*(256-target[k])-1)//source[k])
    for k,j in enumerate(indices):
     moved=source[k]*rate//255;source[k]-=moved;target[k]+=moved;expected[a+j]=aa[k];expected[b+j]=bb[k]
  deltas=[abs(actual[(y*w+x)*10+j]-expected[(y*w+x)*10+j]) for y in range(1,h-1) for x in range(1,w-1) for j in range(10)];checks.append({'stage':stages[step+1]['stage'],'interiorDifferences':sum(d>0 for d in deltas),'max':max(deltas,default=0),'scope':'One-cell border excluded because outside captured input is unknown'})
 unpack=[]
 for s,start in [(stages[5],0),(stages[6],4)]:
  actual=(root/s['file']).read_bytes();expected=bytes(records[-1][i*10+start+j] for i in range(w*h) for j in range(4));d=[abs(a-b)for a,b in zip(actual,expected)];unpack.append({'stage':s['stage'],'differences':sum(x>0 for x in d),'max':max(d,default=0)})
 pack=records[0];thin=[]
 for y in range(1,h-1):
  run=best=0
  for x in range(w):
   v=pack[(y*w+x)*10+2];above=pack[((y-1)*w+x)*10+2];below=pack[((y+1)*w+x)*10+2]
   run=run+1 if v==0 and above>10 and below>10 else 0;best=max(best,run)
  if best>=8:thin.append({'row':y,'zeroPigmentRun':best})
 report.append({'contact':contact,'recipe':r['recipe'],'pairChecks':checks,'unpackChecks':unpack,'preOperatorThinZeroRows':thin})
(root/'stage-analysis.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
