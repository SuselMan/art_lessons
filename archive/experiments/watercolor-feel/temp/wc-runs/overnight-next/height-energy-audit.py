from pathlib import Path
import numpy as np,json
root=Path(__file__).resolve().parent
out={"scope":"Saved CPU geometric water proxy only. Initial/final endpoint audit; no actual measured water, no per-step proof, no GPU solver claim.","models":{}}
for name in ['independent-water-height-integer-smoothheight','independent-water-height-integer-smoothheight-volume']:
 p=root/name
 a=np.load(p/'initial-height.npy');b=np.load(p/'final-height.npy');d=np.load(p/'original-coverage.npy')
 # Coverage file may be RGBA or a binary mask; use recorded H support directly.
 mask=a>0
 mean=a[mask].mean()
 ea=float(np.sum((a[mask]-mean)**2)); eb=float(np.sum((b[mask]-mean)**2))
 out['models'][name]={"shape":list(a.shape),"initialSum":float(a.sum()),"finalSum":float(b.sum()),"sumResidual":float(b.sum()-a.sum()),"initialMax":float(a.max()),"finalMax":float(b.max()),"initialMinInside":float(a[mask].min()),"finalMinInside":float(b[mask].min()),"outsideDomainFinalAbs":float(np.abs(b[~mask]).sum()),"initialVarianceEnergy":ea,"finalVarianceEnergy":eb,"energyReductionFraction":1-eb/ea,"finite":bool(np.isfinite(a).all() and np.isfinite(b).all())}
 assert np.isfinite(b).all() and b.min()>=0
 assert abs(b.sum()-a.sum())<1e-8
 assert np.abs(b[~mask]).sum()==0
 assert eb<=ea+1e-8
 assert b[mask].min()>=a[mask].min()-1e-10 and b.max()<=a.max()+1e-10
(root/'height-energy-audit.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out,indent=2))
