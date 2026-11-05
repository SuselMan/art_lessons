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
  for kwargs in [{'ratio':.8}]:
   d=self.convert(**kwargs)['descriptor']['tip']
   self.assertEqual(d['kind'],'bitmap');self.assertNotIn('profile',d)

 def test_hard_non_antialiased_profile_is_not_a_resampled_bitmap(self):
  a=self.convert(1,aa=0);b=self.convert(80,aa=0)
  self.assertEqual(a['descriptor']['tip'],b['descriptor']['tip'])
  self.assertEqual(a['descriptor']['tip']['profile'],{'kind':'gaussian','fade':1e-6,'antialias':False})
  self.assertEqual(a['descriptor']['version'],29)
 def test_non_antialiased_fades_match_native_defaults_and_average(self):
  for fades,expected in [('',.999999),('hfade=".8" vfade="1"',.1),('hfade=".7" vfade=".9"',.2)]:
   definition=f'<Brush type="auto_brush"><MaskGenerator id="gauss" type="circle" ratio="1" diameter="40" spikes="2" antialiasEdges="0" {fades}/></Brush>'
   with tempfile.TemporaryDirectory() as tmp:
    p=Path(tmp)/'Authored.kpp';p.write_bytes(kpp(definition));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
    tip=c.brushes[0]['descriptor']['tip']
    self.assertAlmostEqual(tip['profile']['fade'],expected)
    self.assertFalse(tip['profile']['antialias']);self.assertNotIn('mask',tip)
 def test_unrepresentable_near_endpoint_fade_keeps_explicit_fallback(self):
  definition='<Brush type="auto_brush"><MaskGenerator id="gauss" type="circle" ratio="1" diameter="40" spikes="2" antialiasEdges="0" hfade=".9999995" vfade=".9999995"/></Brush>'
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'Authored.kpp';p.write_bytes(kpp(definition));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
   self.assertEqual(c.brushes[0]['descriptor']['tip']['kind'],'bitmap')

if __name__=='__main__':unittest.main()
