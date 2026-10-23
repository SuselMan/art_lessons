import json,numpy as np
from pathlib import Path
n=Path(__file__).resolve().parent.parent; old=n/'general-integer-power05-seven-nine-v3';new=n/'general-integer-power05-pad4-seven-nine';fixtures={c['id']:c for c in json.load(open(n/'general-integer-flux-audit/inputs-seven-nine.json'))['cases']};out={}
for cid in ['s7-n3','s9-n3']:
 fs={};ar={}
 for name,p in [('old',old),('new',new)]:
  fs[name]={(f['stage'],f['role']):f for f in json.load(open(p/(cid+'-phase-fields.json')))['frames']};ar[name]={}
  for k,f in fs[name].items():ar[name][k]=np.fromfile(p/f['file'],np.uint8).reshape(f['height'],f['width'],4).astype(np.int64)
 c={}
 for role in ['pigment','color']:
  a=ar['new']['after-fine-before-brush',role];b=ar['new']['after-brush-stable',role];c[role]={'netCodesRGBA':(b-a).sum((0,1)).tolist(),'changedPixels':int((a!=b).any(2).sum()),'absoluteCodesRGBA':abs(b-a).sum((0,1)).tolist(),'prebrushByteExactOld':np.array_equal(a,ar['old']['after-fine-before-brush',role])}
 for stage in ['after-fine-before-brush','after-brush-stable']:
  delta=ar['new'][stage,'color'][:,:,3]-ar['new'][stage,'pigment'][:,:,2];c[stage+'AlphaResidual']={'pixels':int((delta!=0).sum()),'maxAbsCodes':int(abs(delta).max()),'sumCodes':int(delta.sum())}
 f=fs['old']['after-fine-before-brush','pigment'];m=f['mapping'];S=m['S'];box=fixtures[cid]['box'];w,h=f['width'],f['height'];mask=(ar['old']['after-fine-before-brush','pigment'][::-1,:,3]>12)&(ar['new']['after-fine-before-brush','pigment'][::-1,:,3]>12);eroded=mask.copy()
 for dy in range(-4,5):
  for dx in range(-4,5):
   if dx*dx+dy*dy>16:continue
   shifted=np.zeros_like(mask);ys=slice(max(0,dy),min(h,h+dy));xs=slice(max(0,dx),min(w,w+dx));shifted[ys,xs]=mask[slice(max(0,-dy),min(h,h-dy)),slice(max(0,-dx),min(w,w-dx))];eroded&=shifted
 x0=max(0,int((box[0]-m['x0'])/S));x1=min(w,int(np.ceil((box[2]-m['x0'])/S)));y0=max(0,int((box[1]-m['y0'])/S));y1=min(h,int(np.ceil((box[3]-m['y0'])/S)));common=eroded[y0:y1,x0:x1];Y,X=np.indices(common.shape);design=np.column_stack([np.ones(common.sum()),X[common]*S,Y[common]*S]);window=np.outer(np.hanning(common.shape[0]),np.hanning(common.shape[1]))*common;fy=np.fft.fftfreq(common.shape[0],S)[:,None];fx=np.fft.fftfreq(common.shape[1],S)[None,:];freq=np.hypot(fx,fy);c['spectrum']={}
 for name in ['old','new']:
  roi=ar[name]['after-brush-stable','pigment'][::-1,:,2][y0:y1,x0:x1]*2/255;coef=np.linalg.lstsq(design,roi[common],rcond=None)[0];res=(roi-(coef[0]+coef[1]*X*S+coef[2]*Y*S))*window;power=abs(np.fft.fft2(res))**2/res.size**2;radial=(freq>=1/12)&(freq<=1/2);vertical=(abs(fx)>=1/12)&(abs(fx)<=1/2)&(abs(fy)<=1/64);horizontal=(abs(fy)>=1/12)&(abs(fy)<=1/2)&(abs(fx)<=1/64);c['spectrum'][name]={'radial2to12':float(power[radial].sum()),'vertical2to12KyLow':float(power[vertical].sum()),'horizontal2to12KxLow':float(power[horizontal].sum()),'commonMaskCount':int(common.sum())}
 out[cid]=c
(n/'flow-border-audit/pad4-comparison.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
