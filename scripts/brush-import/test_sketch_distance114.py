from pathlib import Path
import unittest,copy,json,base64
from test_krita_sketch_mask101 import SketchMask101Tests
from brush_contract import Catalog
from convert import portable_bundle
class SketchDistance114Tests(unittest.TestCase):
 setUp=SketchMask101Tests.setUp
 tearDown=SketchMask101Tests.tearDown
 convert=SketchMask101Tests.convert
 def test_native_optin_and_old101_and44_exact_absence(self):
  for w,h in[(4,4),(4,2)]:
   b,c=self.convert(w,h,extra='<param name="Sketch/distanceOpacity">true</param>');d=b['descriptor'];self.assertEqual(d['version'],114);self.assertTrue(d['sketch']['distanceOpacity']);self.assertEqual(d['sketch']['distanceOpacityPolicy'],'generic-clamp-v1');self.assertEqual(d['sketch']['maskSize'],[w,h]);self.assertTrue(any(n['feature']=='sketchDistanceOpacity'and n['status']=='approximate'and 'generic-clamp-v1'in n['detail']and 'not optimized native signed byte artifacts'in n['detail']for n in b['compatibility']));self.assertFalse(any('mask distanceOpacity and timers remain unsupported'in n['detail']for n in b['compatibility']))
  old,_=self.convert();self.assertEqual(old['descriptor']['version'],101);self.assertNotIn('distanceOpacityPolicy',old['descriptor']['sketch'])
  simple,_=self.convert(simple=True,extra='<param name="Sketch/distanceOpacity">true</param>');self.assertEqual(simple['descriptor']['version'],44);self.assertNotIn('distanceOpacityPolicy',simple['descriptor']['sketch'])
 def test_full_portable_roundtrip_and_policy_negatives_before_assets(self):
  b,c=self.convert(4,2,extra='<param name="Sketch/distanceOpacity">true</param>');m=c.write();portable={'library':m,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in m['assets']}};p=Path(self.folder)/'positive.json';p.write_text(json.dumps(portable));out=Catalog(Path(self.folder)/'positive');portable_bundle(p,out);self.assertEqual(out.brushes,[b])
  for case in['version','missing','wrong','disabled','simple','child']:
   bad=copy.deepcopy(portable);d=bad['library']['brushes'][0]['descriptor'];s=d['sketch']
   if case=='version':d['version']=113
   elif case=='missing':s.pop('distanceOpacityPolicy')
   elif case=='wrong':s['distanceOpacityPolicy']='optimized-wrap-v1'
   elif case=='disabled':s['distanceOpacity']=False
   elif case=='simple':s['mode']='simple';s.pop('maskSize')
   else:
    child=copy.deepcopy(d);d.pop('sketch');d['tip']={'kind':'round','hardness':1,'aspect':1,'angle':0,'rotation':'fixed'};d['behavior']['dual']={'brush':child,'blendMode':'normal'}
   p.write_text(json.dumps(bad));out=Catalog(Path(self.folder)/case)
   with self.assertRaises(ValueError):portable_bundle(p,out)
   self.assertFalse(out.brushes);self.assertFalse(out.assets)
