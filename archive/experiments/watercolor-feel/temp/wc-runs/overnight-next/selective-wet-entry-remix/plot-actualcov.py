from pathlib import Path
import json,numpy as np,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
p=Path('temp/wc-runs/overnight-next/selective-wet-entry-remix');tag='actualcov-h8-i12';a=np.load(p/('s4-n1-'+tag+'-before.npy'))*2/255;b=np.load(p/('s4-n1-'+tag+'-after.npy'))*2/255;cov=np.load(p/('s4-n1-'+tag+'-coverage.npy'));gate=np.load(p/('s4-n1-'+tag+'-gate.npy'))
fig,ax=plt.subplots(1,5,figsize=(20,5))
for t,z,label,lo,hi,cm in zip(ax,[a,cov,gate,b,b-a],['actual postbrush mass2','actual canonical coverage.B','material entry gate','CPU12×hop8 mass2','delta mass2'],[0,0,0,0,-.15],[1,1,1,1,.15],['viridis','gray','magma','viridis','coolwarm']):t.imshow(z,origin='lower',vmin=lo,vmax=hi,cmap=cm);t.set_title(label);t.axis('off')
fig.suptitle('4/1 actual source23 afterbrush fields; CPU path min every pixel; NOT GPU rendered image');fig.tight_layout();fig.savefig(p/'s4-actualcov-mass-coverage-gate.png',dpi=150)
