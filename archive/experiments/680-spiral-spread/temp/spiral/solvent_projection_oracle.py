import numpy as np,json,math,time
from pathlib import Path
from PIL import Image,ImageDraw
p=Path('temp/spiral/marker-resweep');rows=json.load(open(p/'report.json'));contacts=json.load(open('temp/spiral/brush-contacts.json'));out=Path('temp/spiral/solvent-oracle');out.mkdir(exist_ok=True)
results=[];panels=[]
for shape in ['spiral','blob']:
 row=next(r for r in rows if r['name']==shape+'-marker-off');meta={s['label']:s for s in row['snapshots']}
 def read(l):
  s=meta[l];return np.fromfile(p/(row['name']+'-'+l+'.raw'),np.uint8).reshape(s['h'],s['w'])/255
 coarse=lambda a:a.reshape(384,4,384,4).mean(axis=(1,3))
 water=coarse(read('coverage-water'));initial=coarse(read('pre-front'))
 y,x=np.where(water>.015);ys=slice(max(y.min()-1,0),min(y.max()+2,384));xs=slice(max(x.min()-1,0),min(x.max()+2,384));water=water[ys,xs];initial=initial[ys,xs];mask=water>.015
 H,W=water.shape;gx=(np.arange(xs.start,xs.stop)+.5)*4;gy=1536-(np.arange(ys.start,ys.stop)+.5)*4;xx,yy=np.meshgrid(gx,gy)
 ex=mask[:,:-1]&mask[:,1:];ey=mask[:-1,:]&mask[1:,:]
 degree=np.zeros_like(water);degree[:,:-1]+=ex;degree[:,1:]+=ex;degree[:-1,:]+=ey;degree[1:,:]+=ey
 def div(fx,fy):
  d=np.zeros_like(water);d[:,:-1]+=fx;d[:,1:]-=fx;d[:-1,:]+=fy;d[1:,:]-=fy;return d
 def lap(a):return div((a[:,:-1]-a[:,1:])*ex,(a[:-1,:]-a[1:,:])*ey)
 def projection(fx,fy):
  rhs=div(fx,fy);pressure=np.zeros_like(water);r=rhs.copy();z=r/np.maximum(degree,1);d=z.copy();rz=float((r*z).sum());before=float(np.max(np.abs(rhs)));it=0
  for it in range(1000):
   if np.max(np.abs(r))<1e-9:break
   q=lap(d);dq=float((d*q).sum())
   if abs(dq)<1e-25:break
   alpha=rz/dq;pressure+=alpha*d;r-=alpha*q;z=r/np.maximum(degree,1);next_rz=float((r*z).sum());d=z+(next_rz/max(rz,1e-30))*d;rz=next_rz
  fx=fx+(pressure[:,1:]-pressure[:,:-1])*ex;fy=fy+(pressure[1:,:]-pressure[:-1,:])*ey
  return fx,fy,before,float(np.max(np.abs(div(fx,fy)))),it
 def transport(a,fx,fy,symmetric=False):
  # One immutable pre-step state; each face appears once. Arbitrary RGBA/C channels share flux.
  b=a.copy();concentration=a/np.maximum(water[...,None],.015)
  if symmetric:
   qx=fx[...,None]*(concentration[:,:-1]-concentration[:,1:]);qy=fy[...,None]*(concentration[:-1,:]-concentration[1:,:])
  else:
   qx=fx[...,None]*np.where(fx[...,None]>=0,concentration[:,:-1],concentration[:,1:]);qy=fy[...,None]*np.where(fy[...,None]>=0,concentration[:-1,:],concentration[1:,:])
  b[:,:-1]-=qx;b[:,1:]+=qx;b[:-1,:]-=qy;b[1:,:]+=qy;return b
 # First channel is actual mobile carrier; 7 distinct surrogate pigment/optical channels verify general linear conservation.
 rng=np.random.default_rng(680);state=initial[...,None]*np.concatenate([np.ones((H,W,1)),rng.uniform(.1,.8,(H,W,7))],axis=2)
 signed=state.copy();equalizer=state.copy();uniform=np.repeat(water[...,None],8,axis=2);uniform0=uniform.copy();mass0=state.sum((0,1));mins=[];projection_before=[];projection_after=[];iterations=[];ticks=0;cached=[];weights=[]
 cs=next(c['contacts']for c in contacts if c['shape']==shape)
 for ci,c in enumerate(cs):
  rect=c['rect'];f=c['field'];pix=np.array(f['pixels'],np.uint8).reshape(f['height'],f['width'],4)/255
  lx=(xx-rect['x'])/rect['w'];ly=1-(yy-rect['y'])/rect['h'];valid=(lx>=0)&(lx<1)&(ly>=0)&(ly<1)
  ix=np.minimum(np.maximum((lx*f['width']).astype(int),0),f['width']-1);iy=np.minimum(np.maximum((ly*f['height']).astype(int),0),f['height']-1)
  sampled=pix[iy,ix];v=(sampled[...,:2]*2-1)*valid[...,None];b=sampled[...,2]*valid
  clockx=-np.log(np.maximum(1-np.minimum(b[:,:-1],b[:,1:]),1/255));clocky=-np.log(np.maximum(1-np.minimum(b[:-1,:],b[1:,:]),1/255))
  gain=.3535533905932738*.2*c['radius']/4
  fx=gain*.5*(v[:,:-1,0]+v[:,1:,0])*clockx*np.minimum(water[:,:-1],water[:,1:])*ex
  fy=gain*.5*(v[:-1,:,1]+v[1:,:,1])*clocky*np.minimum(water[:-1,:],water[1:,:])*ey
  kx=np.abs(fx);ky=np.abs(fy);fx,fy,before,after,it=projection(fx,fy);projection_before.append(before);projection_after.append(after);iterations.append(it)
  outgoing=np.zeros_like(water);outgoing[:,:-1]+=np.maximum(fx,0);outgoing[:,1:]+=np.maximum(-fx,0);outgoing[:-1,:]+=np.maximum(fy,0);outgoing[1:,:]+=np.maximum(-fy,0)
  symmetric_degree=np.zeros_like(water);symmetric_degree[:,:-1]+=kx;symmetric_degree[:,1:]+=kx;symmetric_degree[:-1,:]+=ky;symmetric_degree[1:,:]+=ky
  sub=max(1,int(np.ceil(max(np.max(outgoing/np.maximum(water,.015)),np.max(symmetric_degree/np.maximum(water,.015)))/.45)))
  for j in range(sub):signed=transport(signed,fx/sub,fy/sub);equalizer=transport(equalizer,kx/sub,ky/sub,True);uniform=transport(uniform,fx/sub,fy/sub)
  ticks+=sub;cached.append((fx/sub,fy/sub,sub));weights.append(b)
  if ci%20==0:print(shape,ci,len(cs),'projection',it,'residual',after,flush=True)
 incremental=np.zeros_like(state)
 weight_sum=sum(weights,np.zeros_like(water))
 for b,(fx,fy,sub) in zip(weights,cached):
  incremental+=state*(b/np.maximum(weight_sum,1e-12))[...,None]
  for j in range(sub):incremental=transport(incremental,fx,fy)
 incremental+=state*(weight_sum==0)[...,None]
 source=initial>1/255;mass=initial.sum();result=dict(shape=shape,contacts=len(cs),coarse_grid=[W,H],substeps=ticks,water_units=float(water.sum()),source_water_median=float(np.median(water[source])),initial_carrier_mass=float(mass),signed_outside_fraction=float(signed[...,0][~source].sum()/mass),incremental_outside_fraction=float(incremental[...,0][~source].sum()/mass),incremental_mass_error=(incremental.sum((0,1))-mass0).tolist(),incremental_alpha_max=float(incremental[...,0].max()),equalizer_outside_fraction=float(equalizer[...,0][~source].sum()/mass),all_channel_signed_mass_error=(signed.sum((0,1))-mass0).tolist(),all_channel_equalizer_mass_error=(equalizer.sum((0,1))-mass0).tolist(),minimum_signed=float(signed.min()),uniform_concentration_max_error=float(np.max(np.abs(uniform-uniform0))),projection_max_residual=max(projection_after,default=0),projection_max_input_divergence=max(projection_before,default=0),projection_max_iterations=max(iterations,default=0),blob_noop=bool(np.array_equal(signed,state)) if shape=='blob' else None)
 results.append(result);np.savez(out/(shape+'.npz'),water=water,initial=initial,signed=signed,equalizer=equalizer,incremental=incremental,source=source);json.dump(results,open(out/'results.json','w'),indent=2)
 canvas=Image.new('RGB',(900,330),'white');draw=ImageDraw.Draw(canvas)
 for k,(label,a) in enumerate([('initial',initial),('abs equalizer',equalizer[...,0]),('incremental signed solvent',incremental[...,0])]):
  im=Image.fromarray(np.uint8(255-np.clip(a,0,1)*255));im=im.resize((280,280));canvas.paste(im,(k*300,35));draw.text((k*300+5,5),shape+' '+label,fill='black')
 canvas.save(out/(shape+'-carrier.jpg'));print(json.dumps(result,indent=2),flush=True)
