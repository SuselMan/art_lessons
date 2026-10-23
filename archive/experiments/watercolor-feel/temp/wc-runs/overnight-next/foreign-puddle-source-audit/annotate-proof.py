from pathlib import Path
import json,hashlib,numpy as np
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle,Rectangle
r=Path('temp/wc-runs/overnight-next');p=r/'foreign-puddle-source-audit';data=json.loads((p/'actual4-crosssection.json').read_text());cx,cy=data['wetCentre'];box=[1280,154,1776,449];fig,axes=plt.subplots(2,2,figsize=(14,8));proof=[]
for col,folder in enumerate(['physical22-wet-controls','physical22-enteredwater-source-three']):
 png=r/folder/'s4-n1.png';raw=png.read_bytes();im=np.array(Image.open(png).convert('RGB'));H,W=im.shape[:2];yy,xx=np.ogrid[:H,:W];mask=(xx-cx)**2+(yy-cy)**2<64;rgb=im[mask]/255
 top=axes[0,col];top.imshow(im);top.add_patch(Rectangle((box[0],box[1]),box[2]-box[0],box[3]-box[1],fill=False,edgecolor='red',linewidth=1));top.add_patch(Circle((cx,cy),8,fill=False,color='yellow'));top.set_xlim(0,W);top.set_ylim(H,0);top.set_title(folder+' — final export PNG, world coordinates')
 bottom=axes[1,col];bottom.imshow(im);bottom.set_xlim(box[0],box[2]);bottom.set_ylim(box[3],box[1]);bottom.add_patch(Circle((cx,cy),8,fill=False,color='yellow',linewidth=1.5));bottom.plot(cx,cy,'r+',markersize=10);bottom.text(cx+12,cy-12,'world (1521.22,309.63), r=8',color='black',bbox={'facecolor':'white','alpha':.8});bottom.set_title('Exact room PNG ROI; no flip/crop transform of sampling')
 proof.append({'folder':folder,'sourcePNG':str(png),'sourcePNGsha256':hashlib.sha256(raw).hexdigest(),'dimensions':[W,H],'meanRGBDirectFinalPNG':rgb.mean(0).tolist(),'luminanceDirectFinalPNG':float((rgb@np.array([.2126,.7152,.0722])).mean()),'pixels':int(mask.sum()),'crosssectionMeanRGB':data['rows'][col]['stats']['wet-core-8px']['RGBMean'],'rawGLflipAppliedOnlyToFieldBytes':True})
fig.tight_layout();fig.savefig(p/'actual4-wet-centre-annotation.png',dpi=150);plt.close(fig);(p/'annotation-proof.json').write_text(json.dumps({'worldCentre':[cx,cy],'worldROI':box,'coordinateConvention':'Final export PNG top-left y-down sampled directly; ONLY rawGL record flipped for fieldworld alignment','rows':proof},indent=2));print(proof)
