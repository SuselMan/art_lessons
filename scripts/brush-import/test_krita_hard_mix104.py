import copy,unittest
import convert
import test_krita_hard_mix_photoshop as fixtures
class KritaHardMix104Tests(unittest.TestCase):
 def test_native_raw_id_and_old_portable_law_are_separate(self):
  c=fixtures.HardMixPhotoshopTests().brush(mode='hard mix');self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],104);self.assertEqual(d['behavior']['rendering']['blendMode'],'kritaHardMix');convert.validate_portable_profile(d)
  bad=copy.deepcopy(d);bad['version']=103
  with self.assertRaises(ValueError):convert.validate_portable_profile(bad)
  bad['version']=27;bad['behavior']['rendering']['blendMode']='hardMix';convert.validate_portable_profile(bad)
 def test_new_mode_is_not_grain_or_wet_operator(self):
  d=fixtures.HardMixPhotoshopTests().brush(mode='hard mix').brushes[0]['descriptor']
  for field in ('grain','wetMix','dual'):
   bad=copy.deepcopy(d);bad['behavior']['rendering']['blendMode']='normal';bad['behavior'][field]={'blendMode':'kritaHardMix'}
   with self.assertRaises(ValueError):convert.validate_portable_profile(bad)
