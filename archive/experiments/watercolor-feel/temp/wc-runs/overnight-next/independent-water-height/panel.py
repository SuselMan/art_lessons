from PIL import Image,ImageDraw
import pathlib,json,numpy as np
r=pathlib.Path('temp/wc-runs/overnight-next');a=r/'independent-water-height';b=r/'independent-water-height-hop8';files=[a/'before-P-B.png',a/'height1.0-steps120-P-B.png',b/'height1.0-steps120-P-B.png'];panel=Image.new('RGB',(576*3,400),'white');d=ImageDraw.Draw(panel)
for n,p in enumerate(files):panel.paste(Image.open(p).convert('RGB'),(n*576,25));d.text((n*576+8,5),['Actual source23 postbrush P.B','Independent height hop1 /120','Independent height hop8 /120'][n],fill='black')
panel.save(a/'physical-comparison.png');base=np.array(Image.open(files[0])).astype(float);results=[]
for p in files[1:]:
 v=np.array(Image.open(p)).astype(float);center=(slice(140,170),slice(260,320));results.append(dict(file=str(p),centerBoxWorld=[1500,254,1560,284],beforeMeanCodes=float(base[center].mean()),afterMeanCodes=float(v[center].mean()),centerMeanDeltaCodes=float((v-base)[center].mean())))
(a/'center-png-quantized-summary.json').write_text(json.dumps(results,indent=2));print(results)
