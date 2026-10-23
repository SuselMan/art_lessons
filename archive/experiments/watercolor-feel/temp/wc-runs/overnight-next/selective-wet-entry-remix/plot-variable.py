from pathlib import Path
import json,numpy as np,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
p=Path('temp/wc-runs/overnight-next/selective-wet-entry-remix');rows=[]
fig,ax=plt.subplots(1,3,figsize=(15,5));tag='systematic-actualcov-variable-balanced-i12';a=np.load(p/('s4-n1-'+tag+'-before.npy'))*2/255;b=np.load(p/('s4-n1-'+tag+'-after.npy'))*2/255
for t,z,title in zip(ax,[a,b,b-a],['actual postbrush mass2','CPU variable hops ×12 conservative','delta mass2']):t.imshow(z,origin='lower',cmap='coolwarm' if title.startswith('delta')else'viridis',vmin=-.15 if title.startswith('delta')else 0,vmax=.15 if title.startswith('delta')else 1);t.set_title(title);t.axis('off')
fig.suptitle('Actual coverage.B every intermediate pixel; NOT GPU output or physical diffusion validation');fig.tight_layout();fig.savefig(p/'s4-systematic-variable-balanced-comparison.png',dpi=150)
