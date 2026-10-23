import json,os
from PIL import Image
root='docs/reference/strokes'
a=json.load(open(root+'/archive.json'));v='0515e56a'
assert any(x['id']==v for x in a['versions'])
count=0
for s in a['sheets']:
 if not s.get('board',{}).get('room'):continue
 for n in s['board']['slots']:
  st=next(x for x in s['strokes'] if x['n']==int(n));r=st['app'][v]
  p=root+'/'+r['src'];im=Image.open(p);im.load()
  assert im.size==(r['w'],r['h'])
  assert im.getextrema()!=((255,255),(255,255),(255,255)),p
  count+=1
s=next(s for s in a['sheets'] if s['id']=='12');assert len(s['strokes'])==9
for st in s['strokes']:Image.open(root+'/'+st['dry']['src']).verify()
assert count==76,count
assert not any(x['id'].startswith('advect-') for x in a['versions'])
print('76 valid Grafetto crops; 9 valid sheet12 photos; no working versions')
