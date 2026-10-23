from pathlib import Path
import numpy as np,json
root=Path(__file__).resolve().parent
h=np.load(root/'independent-water-height-integer-smoothheight-volume/initial-height.npy'); mask=h>0
out={'scope':'CPU representation sensitivity on reconstructed initial H; not a solver, not WebGL parity or measured fluid volume. Range0..4 no clamping, NEAREST only. Quantized edge comparisons are endpoint adjacent gradients, not actual variablehop schedule.','formats':{}}
for bits in [8,16]:
 n=2**bits-1
 code=np.rint(h/4*n).astype(np.uint32); assert np.all(h<=4)
 q=code.astype(float)/n*4
 if bits==16:
  hi=(code//256).astype(np.uint8);lo=(code%256).astype(np.uint8)
  assert np.array_equal(hi.astype(np.uint32)*256+lo.astype(np.uint32),code)
 errors=np.abs(q-h)[mask]; requests=[]; quantized=[]
 for axis in [0,1]:
  a=[slice(None),slice(None)];b=a.copy();a[axis]=slice(None,-1);b[axis]=slice(1,None);a=tuple(a);b=tuple(b)
  valid=mask[a]&mask[b]
  requests.append(np.abs(h[a]-h[b])[valid]*.1);quantized.append(np.abs(q[a]-q[b])[valid]*.1)
 f=np.concatenate(requests);g=np.concatenate(quantized);active=f>1e-12
 out['formats'][str(bits)]={'quantum':4/n,'maxHeightError':float(errors.max()),'meanHeightError':float(errors.mean()),'initialVolumeDecodeBias':float(q.sum()-h.sum()),'activeAdjacentEdges':int(active.sum()),'activeEdgesLost':int(np.sum(active&(g==0))),'edgeFluxMeanAbsError':float(np.abs(f-g).mean()),'maxEdgeFluxAbsError':float(np.abs(f-g).max()),'relativeTotalEdgeFluxError':float((g.sum()-f.sum())/f.sum()),'rangeFits':bool(h.max()<=4)}
(root/'height-format-audit.json').write_text(json.dumps(out,indent=2)+'\n'); print(json.dumps(out,indent=2))
