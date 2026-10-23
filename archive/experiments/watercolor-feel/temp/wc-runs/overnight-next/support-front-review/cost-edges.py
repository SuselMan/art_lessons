import json,base64,pathlib,math
r=pathlib.Path('temp/wc-runs/overnight-next');d=json.loads((r/'record-headroom/s9-n3-baseline-v2/s9-n3-stages.json').read_text());f=next(f for f in d['frames'] if f['stage']=='mode11' and f['role']=='d');k=next(e['k'] for e in d['events'] if e.get('mode')==12);cm=4/(1-k);b=cm-4
out={'dataParent':'production baseline source, not physical22 exact. Front geometry constants same; source mobile seed thresholds may differ.', 'costMax':cm,'budget':b,'regions':[]}
for s in f['samples']:
 raw=base64.b64decode(s['rgba']);w=s['w'];h=s['h'];codes=[raw[i] for i in range(0,len(raw),4)];row={'name':s['name'],'width':w,'height':h,'costCodesDistinct':len(set(codes)),'minCode':min(codes),'maxCode':max(codes),'thresholds':{}}
 for label,cut in [('stock',b-1.5),('proposed',b-.5)]:
  eligible=0;nonflat=0;total=0;weights=[]
  for y in range(h):
   for x in range(w):
    ci=codes[y*w+x]/255
    for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
     xx=x+dx;yy=y+dy
     if not(0<=xx<w and 0<=yy<h):continue
     total+=1;cj=codes[yy*w+xx]/255;delta=(cj-ci)*cm
     if delta>1e-3:nonflat+=1
     if ci>cut/cm or cj>cut/cm or delta<=1e-3:continue
     eligible+=1;t=max(0,min(1,cj/(cut/cm)));sm=t*t*(3-2*t);fade=(1-sm)**1.6;weights.append(min(1/delta,4)**3*fade)
  row['thresholds'][label]={'directedEdges':total,'positiveGradientEdges':nonflat,'eligibleEdges':eligible,'eligibleFraction':eligible/total,'sumWeightsStride1':sum(weights),'maxWeight':max(weights,default=0)}
 out['regions'].append(row)
(r/'support-front-review/cost-edges.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
