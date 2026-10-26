import tempfile,unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from test_krita import kpp

class GaussianTests(unittest.TestCase):
 def convert(self,diameter=40,extra='',ratio=1,aa=1):
  definition=f'<Brush type="auto_brush" randomness="0" density="1" {extra}><MaskGenerator id="gauss" type="circle" ratio="{ratio}" hfade="1" vfade="1" diameter="{diameter}" spikes="2" antialiasEdges="{aa}"/></Brush>'
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'Authored.kpp';p.write_bytes(kpp(definition));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
   return c.brushes[0]
 def test_actual_radius_profile_does_not_bake_the_source_diameter(self):
  a=self.convert(40);b=self.convert(80)
  self.assertEqual(a['descriptor']['tip'],b['descriptor']['tip'])
  self.assertEqual(a['descriptor']['tip']['kind'],'round')
  self.assertNotIn('mask',a['descriptor']['tip'])
  self.assertEqual(a['descriptor']['tip']['profile'],{'kind':'gaussian','fade':1e-6,'antialias':True})
 def test_eligibility_preserves_legacy_gaussian_cases(self):
  for kwargs in [{'ratio':.8},{'aa':0}]:
   d=self.convert(**kwargs)['descriptor']['tip']
   self.assertEqual(d['kind'],'bitmap');self.assertNotIn('profile',d)

if __name__=='__main__':unittest.main()
