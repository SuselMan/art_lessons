from pathlib import Path
import json,numpy as np,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
p=Path('temp/wc-runs/overnight-next');o=p/'selective-wet-entry-remix/inner-tide-cpu';folder=p/'wet-context-source23-stages-v3-three-four';cid='s4-n1';fs={f['role']:f for f in json.loads((folder/(cid+'-phase-fields.json')).read_text())['frames']if f['stage']=='after-brush-stable'}
def raw(path):return np.frombuffer(path.read_bytes(),np.uint8).reshape(1536,1536,4).astype(float)
bp=raw(folder/fs['pigment']['file']);bc=raw(folder/fs['color']['file']);ap=raw(o/(cid+'-w4-f0.6-P.rgba'));ac=raw(o/(cid+'-w4-f0.6-C.rgba'));ys,xs=np.where(bp[:,:,2]>0);sl=np.s_[max(0,ys.min()-10):min(1536,ys.max()+11),max(0,xs.min()-10):min(1536,xs.max()+11)];fig,ax=plt.subplots(1,2,figsize=(12,5));metrics={}
for a,P,C,name in zip(ax,[bp,ap],[bc,ac],['Actual source23 field swatch ratio','CPU paired8 field swatch ratio']):
 tau=np.divide(4*C[:,:,:3],P[:,:,2,None],where=P[:,:,2,None]>0,out=np.zeros(C.shape[:2]+(3,)));color=np.exp(-tau);color[P[:,:,2]==0]=1;a.imshow(color[sl],origin='lower');a.set_title(name);a.axis('off');mask=P[:,:,2]>8;metrics[name]={'tauMedian':np.median(tau[mask],0).tolist(),'alphaPairResidualCodeSum':float((C[:,:,3]-P[:,:,2]).sum()),'alphaPairResidualPixels':int(np.count_nonzero(C[:,:,3]-P[:,:,2]))}
fig.suptitle('Decoded optical ratio only; NO paper/alpha/composite, not final rendered color');fig.tight_layout();fig.savefig(o/'s4-paired-color-ratio.png',dpi=140);(o/'s4-color-ratio-audit.json').write_text(json.dumps(metrics,indent=2));print(metrics)
