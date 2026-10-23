import pathlib,sys,json,hashlib,numpy as np,time
from PIL import Image
r=pathlib.Path('temp/wc-runs/overnight-next');out=r/'morning-next/chronological-h-heldouts/s6-n6';out.mkdir(parents=True,exist_ok=True);CAPACITY=511;src=r/'morning-next/chronological-h-heldouts/s6-n6/input-sidecar.json';ref=r/'causal-max-increment-audit/cpu-strong80-systematic-v2.py';sys.argv=[str(ref),str(src)];env={};referenceCode=ref.read_text().split('results={};outputs={}')[0].replace("len(data['contacts'])==15","1<=len(data['contacts'])<=64").replace('(255-pair[k][ja+q])//4','('+str(CAPACITY)+'-pair[k][ja+q])//4').replace('0<=v<=255','0<=v<='+str(CAPACITY));(out/'actual-brush-reference.py').write_text(referenceCode);exec(referenceCode,env)
raw=env['raw'];inc=env['inc'];prefix=env['prefix'];w,h=env['w'],env['h'];roi=env['roi'];coverage=env['cov'][-1];domain=np.array(coverage,np.uint8).reshape(h,w,4)[:,:,3]>0;YY,XX=np.indices((h,w));ids=np.arange(w*h).reshape(h,w);targetH=[np.rint(np.array(p[0],dtype=float).reshape(h,w,4)[:,:,0]*2/255*65535/4).astype(np.int64) for p in raw];assert all((targetH[n]-(targetH[n-1] if n else 0)>=0).all() for n in range(4));assert max(x.max() for x in targetH)<=65535
report=dict(materialCodeCapacity=CAPACITY,capacityChange='255 to explicit wider CPU material code bound; source units NOT rescaled; P/C-only brush does not move independent H; not RGBA8/GPU model',captureSHA256=hashlib.sha256(src.read_bytes()).hexdigest(),referenceSHA256=hashlib.sha256(ref.read_bytes()).hexdigest(),scope='Actual raw MAX s6-n6 fourprefix47dabs captured CF count validated. Fixed final originalcoverage. Order-only brush/H operator diagnostic; source P.r is water-weighted dose proxy not actual volume.',sourceMonotone=True,allDeltaExactlyFinal=True,models={});outputs={}
def pressure(M,H,tick):
 v=np.array(M,np.int64).reshape(2,h,w,4).transpose(1,2,0,3).reshape(h,w,8);s0=v.sum((0,1));hs=int(H.sum());hop=[1,2,3][tick%3]
 for axis in ([0,1] if tick%2 else [1,0]):
  for parity in ([0,1] if tick%2 else [1,0]):
   pos=YY if axis==0 else XX;gate=((pos//hop)%2==parity)&(pos+hop<domain.shape[axis])&domain
   for k in range(1,hop+1):gate &= np.roll(domain,-k,axis=axis)
   aa=ids[gate];bb=aa+(hop*w if axis==0 else hop);assert len(np.unique(np.r_[aa,bb]))==2*len(aa);hc=H.reshape(-1);q=v.reshape(-1,8);high=hc[aa]>=hc[bb];don=np.where(high,aa,bb);rec=np.where(high,bb,aa);frac=np.divide(.1*(hc[don]-hc[rec]),hc[don],out=np.zeros(len(don)),where=hc[don]>0);before=q[don].copy();room=CAPACITY-q[rec];lim=np.minimum(1,np.min(np.divide(room,before*frac[:,None],out=np.ones_like(before,float),where=before*frac[:,None]>0),axis=1));frac*=lim
   px=(aa%w+roi['x']).astype(np.uint64);py=(aa//w-roi['y']-h).astype(np.int64).astype(np.uint64);key=((px*0x9e3779b1)^(py*0x85ebca77)^np.uint64((tick*0x165667b1+axis*17+parity*31)&0xffffffff))&np.uint64(0xffffffff);key^=key>>np.uint64(16);key=(key*np.uint64(0x7feb352d))&np.uint64(0xffffffff);key^=key>>np.uint64(15);key=(key*np.uint64(0x846ca68b))&np.uint64(0xffffffff);key^=key>>np.uint64(16);phase=(key.astype(float)+.5)/4294967296;take=np.floor(before*frac[:,None]+phase[:,None]).astype(np.int64);water=np.floor(hc[don]*frac+phase).astype(np.int64);assert (take<=before).all() and (take<=room).all() and (water<=hc[don]).all() and (water<=65535-hc[rec]).all();q[don]-=take;q[rec]+=take;hc[don]-=water;hc[rec]+=water
 assert np.array_equal(v.sum((0,1)),s0) and H.sum()==hs and v.min()>=0 and v.max()<=CAPACITY
 return v.reshape(h,w,2,4).transpose(2,0,1,3).reshape(2,-1).tolist(),H
for mode in ['final-pressure','interleaved-pressure']:
 env['phaseTick']=0;M=[[0]*(w*h*4) for _ in range(2)];H=np.zeros((h,w),np.int64);end=0;steps=0;stages=[];failure=None;start=time.time()
 for n in range(4):
  unclipped=np.array(M,np.int64)+np.array(inc[n],np.int64);clip=np.maximum(unclipped-CAPACITY,0);hc=H+targetH[n]-(targetH[n-1] if n else 0)
  if clip.any() or (hc>65535).any():failure=dict(reason='Additive source headroom failure; stopped BEFORE clamp/no repair',prefix=n,clippedCodesPC=clip.sum(1).tolist(),maxChannelValue=int(unclipped.max()),HOverflowCells=int((hc>65535).sum()));break
  M=unclipped.tolist();H=hc;newend=prefix[n]['contactEnd']
  for ci in range(end,newend):
   M,_=env['transport'](M,ci,ci+1,coverage)
   if mode=='interleaved-pressure':M,H=pressure(M,H,steps);steps+=1
  end=newend;stages.append(dict(prefix=n,sourceSums=env['sums'](M),HsumCodes=int(H.sum()),contacts=end))
 if failure is None and mode=='final-pressure':
  for tick in range(len(env['data']['contacts'])):M,H=pressure(M,H,tick);steps+=1
 report['models'][mode]=dict(complete=failure is None,failure=failure,stages=stages,pressureSteps=steps,brushMicrosteps=env['phaseTick'],runtimeSeconds=time.time()-start,finalSums=env['sums'](M),HsumCodes=int(H.sum()),PBminusCAmax=int(np.max(abs(np.asarray(M[0]).reshape(h,w,4)[:,:,2]-np.asarray(M[1]).reshape(h,w,4)[:,:,3]))),inventoryOutsideOriginalA0P_B=int(np.asarray(M[0]).reshape(h,w,4)[:,:,2][~domain].sum()))
 if failure is None:
  assert env['sums'](M)==env['sums'](raw[-1]);assert H.sum()==targetH[-1].sum();outputs[mode]=np.array(M,np.uint16).reshape(2,h,w,4)
  for k,name in enumerate(['P','C']):(out/f'{mode}-{name}.rgba').write_bytes(np.asarray(M[k],np.uint16).tobytes())
  np.save(out/f'{mode}-PC.npy',outputs[mode]);np.save(out/f'{mode}-Hcodes.npy',H)
if len(outputs)==2:
 d=outputs['interleaved-pressure'].astype(int)-outputs['final-pressure'].astype(int);report['difference']=dict(meanAbsoluteCodes=float(abs(d).mean()),maxCode=int(abs(d).max()),differentCells=int(np.any(d!=0,axis=(0,3)).sum()))
report['complete']=len(outputs)==2;(out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report['models'],indent=2));print('complete',report['complete'])
