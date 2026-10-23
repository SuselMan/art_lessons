import json,pathlib,math,numpy as np
r=pathlib.Path('temp/wc-runs/overnight-next');d=json.loads((r/'full-raw-source-v2-capture/raw-prefix-capture-with-contact-ends.json').read_text());travel=d['travel'];groups=[];g=[];ds=0
for a in travel:
 g.append(a);ds+=math.hypot(a['dx'],a['dy'])
 if ds>=max(1,a['radius']*.5):groups.append(g);g=[];ds=0
if g:groups.append(g)
assert len(groups)==len(d['contacts'])==154
stats=[]
for group,c in zip(groups,d['contacts']):
 cr=c['rect'];f=c['field'];W,H=f['width'],f['height'];X,Y=np.meshgrid(cr['x']+(np.arange(W)+.5)*cr['w']/W,cr['y']+(np.arange(H)+.5)*cr['h']/H);VX=np.zeros((H,W));VY=VX.copy();WX=VX.copy();WY=VX.copy();CX=VX.copy();CY=VX.copy();B=VX.copy()
 for a in group:
  length=math.hypot(a['dx'],a['dy']);U=np.array([a['dx']/length,a['dy']/length]);co=math.cos(a['angle']);si=math.sin(a['angle']);ux=U[0]*co+U[1]*si;uy=-U[0]*si+U[1]*co;rx=max(a['radius']*a['aspect'],.5);ry=max(a['radius'],.5);px=(X-a['x'])*co+(Y-a['y'])*si;py=-(X-a['x'])*si+(Y-a['y'])*co;q=(px/rx)**2+(py/ry)**2;inside=q<1;t=np.maximum(1-q,0);aa=(1-np.exp(-length/ry*a['water']*t))*inside;D=max(1,min(max(rx/ry,ry/rx),abs(ux)+rx/ry*abs(uy) if rx>=ry else ry/rx*abs(ux)+abs(uy)));psi=ux*py-uy*px;wakeX=(ux*t*t-4*t*py*psi/(ry*ry))/D;wakeY=(uy*t*t+4*t*px*psi/(rx*rx))/D;worldX=wakeX*co-wakeY*si;worldY=wakeX*si+wakeY*co;assert np.max(np.hypot(worldX,worldY))<=1+1e-12
  VX=VX*(1-aa)+U[0]*aa;VY=VY*(1-aa)-U[1]*aa;WX=WX*(1-aa)+worldX*aa;WY=WY*(1-aa)-worldY*aa;CX=CX*(1-aa)+U[0]/D*aa;CY=CY*(1-aa)-U[1]/D*aa;B+=aa*(1-B)
 inv=np.where(B>0,1/np.maximum(B,1e-300),0);old=np.stack([VX*inv,VY*inv],axis=2);wake=np.stack([WX*inv,WY*inv],axis=2);control=np.stack([CX*inv,CY*inv],axis=2);weight=B[:,:,None];stats.append({'contact':len(stats),'cells':W*H,'meanVelocityDifferenceFromOld':float(np.sum(np.abs(wake-old)*weight)/(2*np.sum(B))),'meanVelocityDifferenceFromAspectDampedControl':float(np.sum(np.abs(wake-control)*weight)/(2*np.sum(B))),'oldMeanNorm':float(np.sum(np.linalg.norm(old,axis=2)*B)/np.sum(B)),'wakeMeanNorm':float(np.sum(np.linalg.norm(wake,axis=2)*B)/np.sum(B)),'controlMeanNorm':float(np.sum(np.linalg.norm(control,axis=2)*B)/np.sum(B)),'Bsum':float(np.sum(B))})
summary={k:sum(s[k]*s['Bsum'] for s in stats)/sum(s['Bsum'] for s in stats) for k in ['meanVelocityDifferenceFromOld','meanVelocityDifferenceFromAspectDampedControl','oldMeanNorm','wakeMeanNorm','controlMeanNorm']};(r/'nib-wake-audit/actual-nine-directional-cpu.json').write_text(json.dumps({'scope':'actual full9 captured kepttravel154CF, analytical velocities beforeUint8rounding; same existing exposure EMA/B, noGPU','summary':summary,'contacts':stats},indent=2)+'\n');print(summary)
