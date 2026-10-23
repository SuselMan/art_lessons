import json,base64,numpy as np
from pathlib import Path
from PIL import Image,ImageDraw
root=Path('temp/context-loss');out=root/'carried-round2';d=json.load(open(root/'carried-stability-headroom-result.json'));r=d['cases'][2]
a,b,f=[np.array(Image.open(out/('round-2-'+k+'.png')).convert('RGBA')) for k in ['A','B','fresh']]
ops=r['journal']['operations'];strokes=[]
for op in ops:
 if op['type']=='stroke':
  q=np.frombuffer(base64.b64decode(op['dabsPacked'].split(':',1)[1]),'<f4').reshape(-1,10)
  v=np.diff(q[:,:2],axis=0);norm=np.linalg.norm(v,axis=1);cs=(v[:-1]*v[1:]).sum(1)/np.maximum(norm[:-1]*norm[1:],1e-9);turn=q[1:-1,:2][cs<.6]
  strokes.append((op,q,turn))
def stats(x,y):
 df=np.abs(x.astype('i2')-y.astype('i2'));m=df.max(2)>0;big=df.max(2)>8;ys,xs=np.where(m);prem=np.abs(x[:,:,:3].astype('f4')*x[:,:,3,None]/255-y[:,:,:3].astype('f4')*y[:,:,3,None]/255)
 return dict(pixels=int(m.sum()),max=int(df.max()),alphaMax=int(df[:,:,3].max()),above8=int(big.sum()),premultMax=float(prem.max()),bbox=[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())] if len(xs) else None)
res={'A_B':stats(a,b),'A_fresh':stats(a,f),'B_fresh':stats(b,f)}
mask=np.abs(a.astype('i2')-f.astype('i2')).max(2)>8;ys,xs=np.where(mask);pts=np.c_[xs,ys];counts={};details=[]
for pt in pts:
 near=[]
 for op,q,turn in strokes:
  distances=np.linalg.norm(q[:,:2]-pt,axis=1);idx=int(distances.argmin());dist=float(distances[idx]);near.append((dist,op,q,turn,idx))
 dist,op,q,turn,idx=min(near,key=lambda x:x[0]);key=op['id'];counts[key]=counts.get(key,0)+1
 details.append(dict(pixel=pt.tolist(),op=key,distance=dist,endpointDistance=float(min(np.linalg.norm(q[0,:2]-pt),np.linalg.norm(q[-1,:2]-pt))),turnDistance=float(np.linalg.norm(turn-pt,axis=1).min()) if len(turn) else None,alphaA=int(a[pt[1],pt[0],3]),alphaFresh=int(f[pt[1],pt[0],3])))
res['nearestStrokeAbove8']=[dict(id=op['id'],seq=op['seq'],wash=op.get('washId'),preset=op['preset'],above8=counts.get(op['id'],0),n=len(q),bbox=[*q[:,:2].min(0).tolist(),*q[:,:2].max(0).tolist()],carriedPrefix=op['id'] in r['beforeLossCheckpoints'][0]['opIds']) for op,q,t in strokes if counts.get(op['id'])]
res['above8Details']=details
(out/'analysis.json').write_text(json.dumps(res,indent=2))
box=(500,1280,980,1810); panels=[]
for label,x in [('A restored',a),('B native',b),('fresh reader',f)]:
 im=Image.fromarray(x).crop(box);bg=Image.new('RGBA',im.size,'white');bg.alpha_composite(im);can=Image.new('RGB',(im.width,im.height+28),'white');can.paste(bg.convert('RGB'),(0,28));ImageDraw.Draw(can).text((8,8),label,fill='black');panels.append(can)
canvas=Image.new('RGB',(480*3,558),'white')
for i,p in enumerate(panels):canvas.paste(p,(480*i,0))
canvas.save(out/'compare.png')
df=np.abs(a.astype('i2')-f.astype('i2'));viz=np.clip(df[:,:,:3]*8,0,255).astype('u1');im=Image.fromarray(viz).crop(box);im.save(out/'diff-x8.png')
print({k:v for k,v in res.items() if k!='above8Details'})
