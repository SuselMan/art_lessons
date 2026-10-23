from pathlib import Path
import numpy as np,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
p=Path('temp/wc-runs/overnight-next/selective-wet-entry-remix');a=np.load(p/'s4-n1-proxy-before.npy')*2/255;b=np.load(p/'s4-n1-proxy-after.npy')*2/255
fig,ax=plt.subplots(1,3,figsize=(14,5));ax[0].imshow(a,origin='lower',vmin=0,vmax=1,cmap='viridis');ax[1].imshow(b,origin='lower',vmin=0,vmax=1,cmap='viridis');ax[2].imshow(b-a,origin='lower',vmin=-.15,vmax=.15,cmap='coolwarm')
for t,s in zip(ax,['actual postbrush mass2','CPU12×hop8 PROXY','delta mass2']):t.set_title(s);t.axis('off')
fig.suptitle('4/1: experimental P.G wetpath proxy, NOT GPU rendering or measured coverage gate');fig.tight_layout();fig.savefig(p/'s4-proxy-mass-comparison.png',dpi=150)
