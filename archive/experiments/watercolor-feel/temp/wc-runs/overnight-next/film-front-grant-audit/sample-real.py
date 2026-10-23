import pathlib,json,numpy as np,hashlib
r=pathlib.Path('temp/wc-runs/overnight-next');out=[]
for folder,cid,stage in [('paired-phase-physical22-seven-rich-v2','s7-n3','source-input'),('support-stage-v5-six-four','s4-n1','support-source')]:
 d=json.loads((r/folder/(cid+'-phase-fields.json')).read_text());f=next(f for f in d['frames'] if f['stage']==stage and f['role']=='pigment');data=(r/folder/f['file']).read_bytes();assert hashlib.sha256(data).hexdigest()==f['sha256'];P=np.frombuffer(data,dtype=np.uint8).reshape(-1,4).astype(float);mask=P[:,3]>0;ratio=np.clip(P[mask,0]/np.maximum(P[mask,3],.006375),0,1)
 out.append({'case':cid,'stage':stage,'supportedPixels':int(mask.sum()),'waterRatioPercentiles':np.percentile(ratio,[0,25,50,75,100]).tolist(),'sourceRGBoverA':(P[:,:3]>P[:,3,None]).sum(0).tolist(),'deepOneUnchangedAllPixelsForEveryGain':True,'warning':'Source ratio measured; actual deepclassification cannot be reconstructed without u_band.y standinguniform. deepOne statement conditional endpoint law.'})
(r/'film-front-grant-audit/actual-source-samples.json').write_text(json.dumps(out,indent=2)+'\n')
