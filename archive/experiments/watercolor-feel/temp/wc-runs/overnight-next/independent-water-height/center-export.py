import pathlib,json,numpy as np
from PIL import Image
r=pathlib.Path('temp/wc-runs/overnight-next');Y,X=np.meshgrid(np.arange(114,489),np.arange(1240,1816),indexing='ij');disk=(X-1521.2179)**2+(Y-309.6336)**2<=64;assert disk.sum()==202
files=[r/'independent-water-height/before-P-B.png']
for folder in ['independent-water-height','independent-water-height-hop8','independent-water-height-variablehop']:
 files.extend(sorted((r/folder).glob('height*-P-B.png')))
res=[dict(file=str(p),meanEncodedCodes=float(np.asarray(Image.open(p))[disk].mean()),decodedBMean=float(np.asarray(Image.open(p))[disk].mean()*2/255)) for p in files]
(r/'independent-water-height/crossing-center-erratum.json').write_text(json.dumps(dict(center=[1521.2179,309.6336],radius=8,pixels=202,diskSampling='Integer pixel/world coordinates matching prior fixed202 disk; stored field values correspond canonical cell samples.',priorROI='Upper-puddle pane [1500,254,1560,284], NOT crossing centre; previous conclusions about crossing centre withdrawn.',PNGquantized=res),indent=2));print(res)
for name in ['cpu.py','cpu-hop8.py','cpu-variablehop.py']:
 s=(r/'independent-water-height'/name).read_text();s=s.replace('for step in range(1,121):','disk=(X-.5-1521.2179)**2+(Y-.5-309.6336)**2<=64;assert disk.sum()==202\n for step in range(1,121):').replace('results.append(dict(overlapHeight=', 'results.append(dict(fixedCrossingDiskFloatEncodedB=float(v[:,:,2][disk].mean()),fixedCrossingDiskDecodedB=float(2*v[:,:,2][disk].mean()),fixedCrossingDiskInitialDecodedB=float(2*V[:,:,2][disk].mean()),overlapHeight=').replace("o/'report.json'","o/'report-fixed-crossing-float.json'")
 s=s.replace("Image.fromarray(np.uint8(np.clip(v[:,:,2]*255,0,255))).save(o/f'height{overlap}-steps{step}-P-B.png')", "None").replace("Image.fromarray(np.uint8(V[:,:,2]*255)).save(o/'before-P-B.png');",'')
 (r/'independent-water-height'/('fixed-center-'+name)).write_text(s)
