"""Genuine-format authored static IMAGESTAMP, never native GUI/art proof."""
import unittest,tempfile,struct,io,json,base64,copy,hashlib
from pathlib import Path
from PIL import Image
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
from convert import portable_bundle
class SketchImageAlpha162Tests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.i=0
 def tearDown(self):self.tmp.cleanup()
 def make(self,rgb=(255,255,255),extra='',application=1):
  alpha=[255,255,255,255,255,0,0,255,255,0,0,255,255,255,255,255];data=bytes(c for a in alpha for c in(*rgb,a));name=b'AuthoredRGBA\0';gbr=struct.pack('>7I',28+len(name),2,4,4,4,0x47494d50,25)+name+data
  raw=kpp('<Brush type="gbr_brush" filename="image.gbr" scale="1" brushApplication="'+str(application)+'"/>',engine='sketchbrush',resources=extra);c=Catalog(self.root/str(self.i));self.i+=1;b=preset(raw,'rgba-sketch.kpp',c,{'image.gbr':gbr});c.brushes.append(b);return b,c,bytes(alpha)
 def test_original_alpha_not_gray_and_no_unused_rgb_cas(self):
  white,c,alpha=self.make();coloured,c2,_=self.make((12,90,220));d=white['descriptor'];self.assertEqual(d['version'],162);self.assertEqual(d['sketch']['maskSignal'],'image-alpha-v1');self.assertNotIn('color',d['tip']);self.assertEqual((c.output/c.assets[d['tip']['mask']]['file']).read_bytes(),alpha);self.assertEqual(d['tip']['mask'],coloured['descriptor']['tip']['mask']);self.assertEqual(len(c.assets),1);self.assertEqual(len(c2.assets),1)
 def test_private_bridge_cannot_be_shadowed_by_embedded_resource(self):
  alpha=bytes([255,255,255,255,255,0,0,255,255,0,0,255,255,255,255,255]);name='__grafetto_sketch_alpha162_'+hashlib.sha256(alpha).hexdigest()+'.gbr'
  embedded='<resources><resource filename="'+name+'">'+base64.b64encode(b'foreign private name').decode()+'</resource></resources>'
  b,c,_=self.make(extra=embedded);self.assertEqual((c.output/c.assets[b['descriptor']['tip']['mask']]['file']).read_bytes(),alpha)
 def test_unmodified_alpha_application_remains_old101(self):
  b,_,_=self.make(rgb=(12,90,220),application=0);self.assertEqual(b['descriptor']['version'],101);self.assertNotIn('maskSignal',b['descriptor']['sketch'])
 def test_distance_opacity_existing_law_and_unclosed_timer_erase_wash_reject(self):
  b,_,_=self.make(extra='<param name="Sketch/distanceOpacity">true</param>');self.assertEqual(b['descriptor']['sketch']['distanceOpacityPolicy'],'generic-clamp-v1')
  for extra in['<param name="PaintOpSettings/isAirbrushing">true</param>','<param name="PaintOpAction">2</param>','<param name="Krita/erase">true</param>']:
   with self.assertRaises(ValueError):self.make(extra=extra)
 def test_portable_full_alpha_roundtrip_and_marker_scope_before_outputs(self):
  b,c,_=self.make();m=c.write();env={'library':m,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in m['assets']}};p=self.root/'mask.json';p.write_text(json.dumps(env));out=Catalog(self.root/'good');portable_bundle(p,out);self.assertEqual(out.brushes,[b])
  for case in['version','timing','policy','erase']:
   bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor']
   if case=='version':d['version']=161
   elif case=='timing':d['behavior']['timing']={'version':1,'rate':20,'ignoreDistanceSpacing':False}
   elif case=='policy':d['sketch']['maskSignal']='wrong'
   else:d['behavior']['erase']=True
   p.write_text(json.dumps(bad));out=Catalog(self.root/('bad-'+case))
   with self.assertRaises(ValueError):portable_bundle(p,out)
   self.assertFalse(out.brushes);self.assertFalse(out.assets);self.assertEqual(list(out.output.iterdir()),[])
if __name__=='__main__':unittest.main()
