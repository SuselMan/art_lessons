from pathlib import Path
import tempfile,unittest,io,struct,json,base64,copy
from PIL import Image
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
from convert import portable_bundle
class SketchMask101Tests(unittest.TestCase):
 def convert(self,w=4,h=4,extra='',simple=False):
  filename='mask.gbr';name=b'qa\0';data=struct.pack('>7I',28+len(name),2,w,h,1,0x47494d50,25)+name+bytes([255 if x in(0,w-1)or y in(0,h-1)else 0 for y in range(h)for x in range(w)])
  params=('<param name="Sketch/simpleMode">true</param>'if simple else'')+extra
  raw=kpp('<Brush type="gbr_brush" filename="mask.gbr" scale="1" ColorAsMask="1"/>',engine='sketchbrush',resources=params)
  root=Path(self.folder);cat=Catalog(root/('out'+str(self.counter)));self.counter+=1;b=preset(raw,'MaskSketch.kpp',cat,{filename:data});cat.brushes.append(b);return b,cat
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.folder=self.tmp.name;self.counter=0
 def tearDown(self):self.tmp.cleanup()
 def test_genuine_square_nonsquare_and_old_simple_unchanged(self):
  for w,h in[(4,4),(4,2),(3,4)]:
   b,c=self.convert(w,h);d=b['descriptor'];self.assertEqual(d['version'],101);self.assertEqual(d['sketch']['mode'],'mask');self.assertEqual(d['sketch']['maskSize'],[w,h]);self.assertEqual(d['tip']['kind'],'bitmap');self.assertLessEqual(c.assets[d['tip']['mask']]['size'],256)
  b,_=self.convert(simple=True);self.assertEqual(b['descriptor']['version'],44);self.assertEqual(b['descriptor']['sketch']['mode'],'simple');self.assertNotIn('maskSize',b['descriptor']['sketch']);self.assertEqual(b['descriptor']['tip']['kind'],'round')
 def test_unsupported_masks_distanceopacity_and_caps_remain_explicit(self):
  for args in[{'w':257},{'extra':'<param name="Sketch/distanceOpacity">true</param>'}]:
   with self.assertRaises(ValueError):self.convert(**args)
 def test_full_portable_cas_roundtrip_and_corrupt_metadata_before_output(self):
  b,c=self.convert(4,2);m=c.write();portable={'library':m,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in m['assets']}};p=Path(self.folder)/'roundtrip.json';p.write_text(json.dumps(portable));out=Catalog(Path(self.folder)/'good');portable_bundle(p,out);self.assertEqual(out.brushes,[b])
  for case in['version','size','distance','child']:
   bad=copy.deepcopy(portable);d=bad['library']['brushes'][0]['descriptor']
   if case=='version':d['version']=100
   elif case=='size':d['sketch']['maskSize']=[3,4]
   elif case=='distance':d['sketch']['distanceOpacity']=True
   else:
    child=copy.deepcopy(d);d.pop('sketch');d['tip']={'kind':'round','hardness':1,'aspect':1,'angle':0,'rotation':'fixed'};d['behavior']['dual']={'brush':child,'blendMode':'multiply'}
   p.write_text(json.dumps(bad));out=Catalog(Path(self.folder)/case)
   with self.assertRaises(ValueError):portable_bundle(p,out)
   self.assertFalse(out.brushes);self.assertFalse(out.assets)
