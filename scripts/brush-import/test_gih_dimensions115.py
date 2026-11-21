import base64,copy,json,tempfile,unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from test_gih_dimensions113 import pipe
from test_krita import kpp
class Dimensions115(unittest.TestCase):
 def imported(self,tmp,dims,actual=3):
  p=Path(tmp)/'Own.kpp';p.write_bytes(kpp('<Brush type="gbr_brush" filename="own.gih"/>'));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'own.gih':pipe(dims,actual)});self.assertEqual(c.skipped,[]);return c
 def test_large_tensor_product_and_actual_frames_are_bounded(self):
  from krita_import import gih
  from test_gih_dimensions113 import pipe
  for dims in ([('angular',18),('incremental',22)],[('angular',18),('incremental',41)]):
   parsed=gih(pipe(dims,actual=3));self.assertEqual(parsed['dimensions'],[{'mode':mode,'rank':rank} for mode,rank in dims]);self.assertEqual(len(parsed['frames']),3)
  with self.assertRaises(ValueError):gih(pipe([('angular',33),('incremental',32)],actual=1))
 def test_surplus_frame_preserves_krita_strides(self):
  from krita_import import gih
  from test_gih_dimensions113 import pipe
  dims=[('angular',18),('random',7)]
  data=pipe(dims,actual=127).replace(b'126 ncells:126',b'127 ncells:127',1)
  self.assertEqual(len(gih(data)['frames']),127)
  with self.assertRaises(ValueError):gih(data.replace(b'127 ncells:127',b'144 ncells:144',1))
 def test_genuine_default_API_two_three_four_dimensions_and_policies(self):
  for dims in[[('random',4),('random',4)],[('incremental',2),('incremental',3)],[('pressure',2),('random',2),('angular',2)],[('incremental',2),('xtilt',2),('random',2),('ytilt',2)]]:
   with self.subTest(dims=dims),tempfile.TemporaryDirectory()as tmp:
    c=self.imported(tmp,dims);d=c.brushes[0]['descriptor'];a=d['tip']['animation'];self.assertEqual(d['version'],115);self.assertEqual(a['dimensions'],[{'mode':m,'rank':r}for m,r in dims]);self.assertEqual(len(a['frames']),3)
    self.assertEqual(a.get('randomPolicy'),'grafetto-dim-stream-v1'if any(m=='random'for m,r in dims)else None)
    if any(m=='angular'for m,r in dims):self.assertEqual(d['behavior']['strokeInput'],{'version':1,'initialDirection':'cursorHistory'})
 def test_full_portable_policy_IFF_version_and_closed_scope_before_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=self.imported(tmp,[('random',2),('incremental',2)]);data={'library':c.write(),'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}};p=Path(tmp)/'Own.grafetto-brushes.json';p.write_text(json.dumps(data));o=convert.Catalog(Path(tmp)/'round');convert.portable_bundle(p,o);self.assertEqual(c.brushes,o.brushes)
   edits=[lambda d:d.update(version=114),lambda d:d['tip']['animation'].pop('randomPolicy'),lambda d:d['tip']['animation'].update(randomPolicy='native-rng'),lambda d:d['tip']['animation']['dimensions'][0].update(mode='incremental'),lambda d:d['behavior'].update(erase=True),lambda d:d['behavior'].update(dual={'brush':copy.deepcopy(d),'blendMode':'multiply'})]
   for i,edit in enumerate(edits):
    bad=copy.deepcopy(data);edit(bad['library']['brushes'][0]['descriptor']);p.write_text(json.dumps(bad));o=convert.Catalog(Path(tmp)/('bad'+str(i)))
    with self.assertRaises(ValueError):convert.portable_bundle(p,o)
    self.assertEqual(list(o.output.iterdir()),[])
 def test_foreign_private_origins_do_not_gain_support(self):
  for engine in['hatchingbrush','hairybrush','sketchbrush','curvebrush']:
   with self.subTest(engine=engine),tempfile.TemporaryDirectory()as tmp:
    p=Path(tmp)/'Foreign.kpp';p.write_bytes(kpp('<Brush type="gbr_brush" filename="own.gih"/>',engine=engine));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'own.gih':pipe([('random',2),('incremental',2)],3)})
    for b in c.brushes:self.assertNotEqual(b['descriptor']['tip'].get('animation',{}).get('mode'),'dimensions')
