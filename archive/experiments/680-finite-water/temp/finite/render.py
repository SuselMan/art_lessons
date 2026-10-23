import json,sys
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np
p=Path(sys.argv[1]); rows=json.load(open(p/'report.json'))
for r in rows:
 for n,f in r['fields'].items():
  if 'appearance' not in n:continue
  raw=np.frombuffer((p/(r['variant']+'-'+n+'.rgba')).read_bytes(),np.uint8).reshape(f['h'],f['w'],4)[::-1].astype(np.float32)
  rgb=np.clip(raw[:,:,:3]+255-raw[:,:,3:4],0,255).astype(np.uint8)
  Image.fromarray(rgb).save(p/(r['variant']+'-'+n+'.png'))
