from pathlib import Path
import json,base64,struct,copy,math,hashlib
n=Path('temp/wc-runs/overnight-next');d=n/'morning-next/raw-four-prefixes';old=json.load(open(n/'full-raw-source-capture/capture-spec-v2.json'));allcases=json.load(open(n/'inputs.json'))['cases']+json.load(open(n/'holdout-inputs/holdout-inputs.json'))['cases'];proof=[]
for cid in ['s6-n6','s6-n5','s9-n1']:
 c=next(c for c in allcases if c['id']==cid);op=copy.deepcopy(c['ops'][0]);raw=list(struct.iter_unpack('<10f',base64.b64decode(op['dabsPacked'].split(':')[1])));ds=[list(x)for x in raw[:47]];count=len(ds);assert count>=8
 def bounds(ds):
  out=[]
  for x in ds:
   ry=x[5]*.5;rx=ry*max(1,x[6]);ex=math.hypot(rx*math.cos(x[7]),ry*math.sin(x[7]));ey=math.hypot(rx*math.sin(x[7]),ry*math.cos(x[7]));out.append([x[0]-ex,x[1]-ey,x[0]+ex,x[1]+ey])
  return[min(x[0]for x in out),min(x[1]for x in out),max(x[2]for x in out),max(x[3]for x in out)]
 bb=bounds(ds);dx=512-(bb[0]+bb[2])/2;dy=512-(bb[1]+bb[3])/2
 for x in ds:x[0]+=dx;x[1]+=dy
 bb=bounds(ds);roi={'x':math.floor(bb[0])-16,'y':math.floor(bb[1])-16,'w':math.ceil(bb[2])-math.floor(bb[0])+32,'h':math.ceil(bb[3])-math.floor(bb[1])+32};assert max(roi['w'],roi['h'])<=512
 op['dabsPacked']='1:'+base64.b64encode(b''.join(struct.pack('<10f',*x)for x in ds)).decode();
 for key in ['wet','wetProfile']:
  if isinstance(op.get(key),str):op[key]=op[key][:count]
 inp={'base':'7ca4cf5d','scope':'Derived synthetic truncation first47 original dabs+translation ONLY; not full human fixture','cases':[{**copy.deepcopy(c),'id':cid+'-raw4-groups4','ops':[op]},{**copy.deepcopy(c),'id':cid+'-raw4-oneshot','ops':[op]}]};(d/(cid+'-inputs.json')).write_text(json.dumps(inp,indent=2));s=copy.deepcopy(old);s['id']=cid+'-raw-four-prefix-source-capture';s['scope']=inp['scope'];patch=s['runtimePatches'][22];a=patch['after'].replace('dabs.length!==477',f'dabs.length!=={count}').replace("'Fullraw477replayONLY'","'Bounded raw prefix replayONLY'").replace("globalThis.__wcFullRawMode==='groups16'","globalThis.__wcFullRawMode==='groups4'").replace('Array.from({length:16},(_,i)=>[i*30,Math.min(477,(i+1)*30)])',f'Array.from({{length:4}},(_,i)=>[i*12,Math.min({count},(i+1)*12)])').replace('[[0,477]]',f'[[0,{count}]]').replace('{"x": 350, "y": 430, "w": 276, "h": 199}',json.dumps(roi));patch['after']=a;(d/(cid+'-spec.json')).write_text(json.dumps(s,indent=2));proof.append({'case':cid,'originalOpsCanonicalSHA':hashlib.sha256(json.dumps(c['ops'],sort_keys=True,separators=(',',':')).encode()).hexdigest(),'originalFirstOpDabCount':len(raw),'prefixCount':count,'groups':[[i*12,min(count,(i+1)*12)]for i in range(4)],'translation':[dx,dy],'roi':roi,'originalOtherOpsNotExecuted':len(c['ops'])-1})
(d/'derived-prefix-provenance.json').write_text(json.dumps(proof,indent=2));s=(n/'full-raw-source-capture/capture-render-v2.mjs').read_text().replace('test.id.endsWith("groups16")?"groups16":"oneshot"','test.id.endsWith("groups4")?"groups4":"oneshot"');s=s.replace("['s9-n3-fullraw-groups16','s9-n3-fullraw-oneshot']","input.cases.map(c=>c.id)");(d/'capture-render.mjs').write_text(s);print(proof)
