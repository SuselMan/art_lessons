import sys,json,hashlib
from pathlib import Path
from PIL import Image,ImageChops
root=Path(sys.argv[1]);images={name:Image.open(root/(name+'-final.png')).convert('RGBA') for name in ['LEGACY','BINARY','PACKED']}
assert len({i.size for i in images.values()})==1

def compare(a,b):
    x,y=images[a].tobytes(),images[b].tobytes();pixels=0;maximum=0
    for n in range(0,len(x),4):
        diffs=[abs(x[n+k]-y[n+k]) for k in range(4)]
        pixels+=any(diffs);maximum=max(maximum,*diffs)
    return {'differentPixels':pixels,'maxRGBA':maximum}
out={'size':images['LEGACY'].size,'nonempty':all(any(p[3] and any(c<254 for c in p[:3]) for p in i.getdata()) for i in images.values()),'binaryPacked':compare('BINARY','PACKED'),'legacyBinary':compare('LEGACY','BINARY'),'sha':{k:hashlib.sha256((root/(k+'-final.png')).read_bytes()).hexdigest() for k in images}}
(root/'whole-rgba-comparison.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
