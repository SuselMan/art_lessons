import numpy as np,json,pathlib,base64,math,time,sys,hashlib
src=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(exist_ok=True,parents=True);d=json.loads(src.read_text());ps=d['prefixes'];roi=ps[0]['roi'];w,h=roi['w'],roi['h'];K=8
raw=[np.concatenate([np.frombuffer(base64.b64decode(p[k]),np.uint8).reshape(h,w,4) for k in ['P','C']],axis=2).astype(np.int32) for p in ps];assert all(p['roi']==roi for p in ps);assert all(np.all(a>=b) for a,b in zip(raw[1:],raw[:-1]));delta=[raw[0]]+[a-b for a,b in zip(raw[1:],raw[:-1])];assert np.array_equal(np.sum(delta,axis=0),raw[-1]);assert all(np.array_equal(a[:,:,2],a[:,:,3]) and np.array_equal(a[:,:,3],a[:,:,7]) for a in raw)
# Fixed one-shot coverage across all source models if provided. Required forfull16.
if len(sys.argv)>3:covdoc=json.loads(pathlib.Path(sys.argv[3]).read_text());cp=covdoc['prefixes'][-1];assert cp['roi']==roi;cv=np.frombuffer(base64.b64decode(cp['coverage']),np.uint8).reshape(h,w,4)[:,:,3].astype(np.float64)/255;coverage=[cv]*len(ps);coverageLaw='fixed matched ONE-SHOT original coverage ALLmodels ALLprefixes; not actual evolvingenginecoverage'
else:coverage=[np.frombuffer(base64.b64decode(p['coverage']),np.uint8).reshape(h,w,4)[:,:,3].astype(np.float64)/255 for p in ps];coverageLaw='cumulativeactualprefixcoverage causal; finalcoverage finalfirst (smallscalarvalidation)'
def shift(a,dx,dy):
 b=np.zeros_like(a);y0=max(0,-dy);y1=min(a.shape[0],a.shape[0]-dy);x0=max(0,-dx);x1=min(a.shape[1],a.shape[1]-dx);b[y0:y1,x0:x1]=a[y0+dy:y1+dy,x0+dx:x1+dx];return b
cache=[];dirs=[(1,0),(-1,0),(0,1),(0,-1)]
for c in d['contacts']:
 cr=c['rect'];lo=max(0,math.floor(cr['x']-roi['x'])-1);hi=min(w,math.ceil(cr['x']+cr['w']-roi['x'])+1);bot=max(0,math.floor(roi['y']+h-cr['y']-cr['h'])-1);top=min(h,math.ceil(roi['y']+h-cr['y'])+1);yy,xx=np.mgrid[bot:top,lo:hi];u=(roi['x']+xx+.5-cr['x'])/cr['w'];v=(cr['y']+cr['h']-(roi['y']+h-yy-.5))/cr['h'];cf=c['field'];f=np.array(cf['pixels'],np.float64).reshape(cf['height'],cf['width'],4)/255;fx=u*cf['width']-.5;fy=v*cf['height']-.5;ix=np.floor(fx).astype(int);iy=np.floor(fy).astype(int);ax=fx-ix;ay=fy-iy;F=np.zeros(xx.shape+(3,))
 for dx,dy,q in [(0,0,(1-ax)*(1-ay)),(1,0,ax*(1-ay)),(0,1,(1-ax)*ay),(1,1,ax*ay)]:F+=f[np.clip(iy+dy,0,cf['height']-1),np.clip(ix+dx,0,cf['width']-1),:3]*q[:,:,None]
 F[:,:,0:2]=F[:,:,0:2]*2-1;F[(u<0)|(u>1)|(v<0)|(v>1)]=0
 assert np.all(F[0,:,2]==0) and np.all(F[-1,:,2]==0) and np.all(F[:,0,2]==0) and np.all(F[:,-1,2]==0),'crop closure Bedge must0'
 zmax=max(-math.log(max(1-int(b)/255,1/255)) for b in cf['pixels'][2::4]);H=max(1,math.ceil(.2*c['radius']*zmax*math.sqrt(2)/.84));base=max(1,math.ceil(.2*c['radius']*zmax*math.sqrt(2)/.84));assert H<=64;gain=.2*c['radius']/H;mix=.02*base/H
 cache.append((lo,hi,bot,top,F,xx,yy,H,gain,mix))
assert sum(c[7] for c in cache)<=8192
summ=lambda a:a.sum(axis=(0,1)).tolist();reports={};timing=time.monotonic()
for mode in ['trueIncrement','finalSourceFirst','wholePrefixRefill']:
 M=raw[-1].copy() if mode=='finalSourceFirst' else np.zeros_like(raw[0]);tick=0;end=0;stages=[];steps=0;started=time.monotonic()
 for n in range(len(ps)):
  want=M+delta[n] if mode=='trueIncrement' else np.maximum(M,raw[n]) if mode=='wholePrefixRefill' else M;clipping=np.maximum(want-255,0).sum(axis=(0,1)).tolist();M=np.minimum(want,255);deposited=summ(M);newend=ps[n]['contactEnd'];cv=coverage[-1] if mode=='finalSourceFirst' and len(sys.argv)<=3 else coverage[n]
  for ci in range(end,newend):
   lo,hi,bot,top,F,xx,yy,H,gain,mix=cache[ci];occ=cv[bot:top,lo:hi];B=[];V=[];contacts=[]
   for dx,dy in dirs:
    b=np.minimum(F[:,:,2],shift(F[:,:,2],dx,dy));t=np.clip((np.minimum(occ,shift(occ,dx,dy))-.015)/.135,0,1);mid=shift(occ,1 if dx>0 else 0,1 if dy>0 else 0);contacts.append(t*t*(3-2*t)*(mid>=.015));B.append(b);V.append(np.maximum(F[:,:,0]*dx+F[:,:,1]*dy,0))
   Z=[np.fromiter((-math.log(float(v)) for v in np.maximum(1-b,1/255).flat),dtype=np.float64).reshape(b.shape) for b in B]
   patch=M[bot:top,lo:hi];pre=summ(patch)
   for step in range(H):
    xi=(((xx+roi['x'])%251*73+(yy-roi['y']-h)%251*109+(tick%251)*137)%251+.5)/251;tick+=1;cumulative=np.zeros(patch.shape[:2]);fluxes=[]
    for k,(dx,dy) in enumerate(dirs):
     neighbor=shift(patch,dx,dy);donor=patch[:,:,3];fraction=(gain*V[k]*Z[k]+mix*np.maximum(donor-neighbor[:,:,3],0)/np.maximum(donor,.01275)*B[k])*contacts[k];room=(255-neighbor)//4;den=patch*fraction[:,:,None];limit=np.min(np.where(den>0,room/np.maximum(den,1e-300),1),axis=2);fraction*=np.minimum(1,limit);before=cumulative.copy();cumulative+=fraction;flux=np.floor(patch*cumulative[:,:,None]+xi[:,:,None])-np.floor(patch*before[:,:,None]+xi[:,:,None]);flux=np.minimum(flux,room).astype(np.int32);fluxes.append(flux)
    updated=patch-sum(fluxes)
    for k,(dx,dy) in enumerate(dirs):updated+=shift(fluxes[k],-dx,-dy)
    assert np.all((updated>=0)&(updated<=255));assert summ(updated)==summ(patch),'integer transportmass';patch=updated;steps+=1
   assert summ(patch)==pre;M[bot:top,lo:hi]=patch
  end=newend;stages.append({'n':n,'depositClippingBy8channel':clipping,'depositedSums':deposited,'afterSums':summ(M),'phaseTick':tick})
  if n==3:shortMs=(time.monotonic()-started)*1000
 for k,name in [(0,'P'),(4,'C')]:out.joinpath('numpy-strong20-'+mode+'-'+name+'.rgba').write_bytes(M[:,:,k:k+4].astype(np.uint8).tobytes())
 reports[mode]={'stages':stages,'finalSums':summ(M),'steps':steps,'firstFourPrefixMs':shortMs,'elapsedMs':(time.monotonic()-started)*1000,'PCAlphaResidual':int(np.abs(M[:,:,3]-M[:,:,7]).sum()),'PBAResidual':int(np.abs(M[:,:,2]-M[:,:,3]).sum())}
report={'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'codeSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'roi':roi,'prefixes':len(ps),'contacts':len(cache),'sourceMonotone':True,'sumDeltaExact':True,'coverageLaw':coverageLaw,'models':reports,'totalMs':(time.monotonic()-timing)*1000,'limits':['CPU NumPyfloat64 notGPUfloat32; exactcapturedsource/CF, no raster approximation','croppedcontact+onecellhalo, Bboundary0verified; no crosscrop flux','fixedcoverage law explicit, does not claim fullenginechronology equivalent','wholePrefixRefill counterfactual not exactR7 newlydrawnstamps','No finaloptics/front/diffusion, physicaloperator only']};out.joinpath('numpy-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:{q:v[q] for q in ['finalSums','steps','firstFourPrefixMs','elapsedMs']} for k,v in reports.items()},indent=2))
