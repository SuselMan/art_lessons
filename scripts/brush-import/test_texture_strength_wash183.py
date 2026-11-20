from pathlib import Path
import unittest,tempfile,copy,json
from test_texture_lightness108 import fixture,portable
from brush_contract import Catalog
from convert import portable_bundle
from texture_strength_wash183 import texture_strength_wash183_scope
class TextureStrengthWash183Tests(unittest.TestCase):
 def test_native_fade_distance_combined_bothmaterials_andportable(self):
  sensors=['<params id="fade" length="8" periodic="0"/>','<params id="distance" length="24" periodic="1"/>','<params id="sensorslist"><ChildSensor id="pressure"/><ChildSensor id="fade" length="8" periodic="0"/></params>']
  for mode in('2','3'):
   for sensor in sensors:
    with self.subTest(mode=mode,sensor=sensor),tempfile.TemporaryDirectory()as tmp:
     root=Path(tmp);c,m,_=fixture(root,{'PaintOpAction':'2','Texture/Pattern/TexturingMode':mode,'Texture/Strength/Value':'.5','Texture/Strength/UseCurve':'true','Texture/Strength/Sensor':sensor,'Texture/Strength/curveMode':'1'});b=m['brushes'][0]['descriptor'];self.assertEqual(b['version'],183);self.assertTrue(texture_strength_wash183_scope(b));self.assertEqual(b['texture']['strength'],.5);env,out=portable(root,c,m);self.assertEqual(out.brushes,m['brushes']);self.assertEqual(out.assets,c.assets)
     if 'sensorslist'in sensor:self.assertEqual(b['behavior']['modulations']['grainDepth'][0]['combine']['constant'],.5)
 def test_portable_rejects_beforepublication(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);c,m,_=fixture(root,{'PaintOpAction':'2','Texture/Pattern/TexturingMode':'3','Texture/Strength/UseCurve':'true','Texture/Strength/Sensor':'<params id="fade" length="8" periodic="0"/>'});env,_=portable(root,c,m)
   for kind in('downgrade','random','time','array','size','timer'):
    bad=copy.deepcopy(env);b=bad['library']['brushes'][0]['descriptor'];d=b['behavior']['modulations']['grainDepth'][0]
    if kind=='downgrade':b['version']=180
    elif kind in('random','time'):d['control']=kind
    elif kind=='array':d['control']=['dabProgress']
    elif kind=='size':b['behavior']['dynamics']={'size':copy.deepcopy(d)}
    else:b['behavior']['timing']={'version':1,'rate':20,'ignoreDistanceSpacing':False}
    path=root/(kind+'.json');path.write_text(json.dumps(bad));out=Catalog(root/kind)
    with self.subTest(kind=kind),self.assertRaises(ValueError):portable_bundle(path,out)
    self.assertFalse(out.brushes);self.assertFalse(out.assets);self.assertFalse(list(out.output.iterdir()))
 def test_native_time_fuzzy_andnonstrengthfade_reject(self):
  for sensor in('<params id="fuzzy"/>','<params id="time" duration="8"/>','<params id="drawingangle"/>'):
   with self.subTest(sensor=sensor),tempfile.TemporaryDirectory()as tmp,self.assertRaises(ValueError):fixture(Path(tmp),{'PaintOpAction':'2','Texture/Pattern/TexturingMode':'3','Texture/Strength/UseCurve':'true','Texture/Strength/Sensor':sensor})
