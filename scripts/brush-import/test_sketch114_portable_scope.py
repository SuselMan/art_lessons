from pathlib import Path
import unittest,copy,json,base64
from test_krita_sketch_mask101 import SketchMask101Tests
from brush_contract import Catalog
from convert import portable_bundle
class Sketch114PortableScopeTests(unittest.TestCase):
 setUp=SketchMask101Tests.setUp
 tearDown=SketchMask101Tests.tearDown
 convert=SketchMask101Tests.convert
 def payload(self,distance=True):
  b,c=self.convert(4,2,extra='<param name="Sketch/distanceOpacity">'+str(distance).lower()+'</param>');m=c.write();return {'library':m,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in m['assets']}}
 def test_genuine114_parent_dual_and_scope_rejected_before_any_output(self):
  original=self.payload();d=original['library']['brushes'][0]['descriptor'];child=copy.deepcopy(d);child.pop('sketch');child['tip']={'kind':'round','hardness':1,'aspect':1,'angle':0,'rotation':'fixed'}
  cases=[('dual',lambda d:d['behavior'].update(dual={'brush':child,'blendMode':'normal'})),('emptyDual',lambda d:d['behavior'].update(dual={})),('nullDual',lambda d:d['behavior'].update(dual=None)),('timing',lambda d:d['behavior'].update(timing={})),('wetMix',lambda d:d['behavior'].update(wetMix={})),('taper',lambda d:d['behavior'].update(taper={})),('mirror',lambda d:d['behavior'].update(mirror={})),('texture',lambda d:d.update(texture={})),('wet',lambda d:d.update(wet={})),('otherFamily',lambda d:d.update(hatching={})),('mixer',lambda d:d.update(mixer={})),('paper',lambda d:d.update(paperInteraction=.25)),('blend',lambda d:d['behavior']['rendering'].update(blendMode='multiply')),('accumulation',lambda d:d['behavior']['rendering'].update(accumulation='wash')),('behaviorVersion',lambda d:d['behavior'].update(version=1))]
  for name,mutate in cases:
   with self.subTest(name=name):
    bad=copy.deepcopy(original);mutate(bad['library']['brushes'][0]['descriptor']);p=Path(self.folder)/(name+'.json');p.write_text(json.dumps(bad));out=Catalog(Path(self.folder)/('rejected-'+name))
    with self.assertRaises(ValueError):portable_bundle(p,out)
    self.assertEqual(out.brushes,[]);self.assertEqual(out.assets,{});self.assertEqual(list(out.output.iterdir()),[])
 def test_genuine114_and_unmodified_old101_positive_roundtrip(self):
  for distance in[True,False]:
   payload=self.payload(distance);p=Path(self.folder)/('positive'+str(distance)+'.json');p.write_text(json.dumps(payload));out=Catalog(Path(self.folder)/('accepted'+str(distance)));portable_bundle(p,out);self.assertEqual(out.brushes,payload['library']['brushes']);d=out.brushes[0]['descriptor'];self.assertEqual(d['version'],114 if distance else 101);self.assertEqual('distanceOpacityPolicy'in d['sketch'],distance)
