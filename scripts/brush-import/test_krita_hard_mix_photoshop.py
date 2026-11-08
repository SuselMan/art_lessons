import tempfile,unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from test_krita import kpp
class HardMixPhotoshopTests(unittest.TestCase):
 def brush(self,mode='hard_mix_photoshop',engine='paintbrush',extra=''):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/'Authored.kpp';p.write_bytes(kpp(mode=mode,engine=engine,resources=extra));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c);return c
 def test_native_pixel_distinct102_and_portable_gate(self):
  c=self.brush();self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],102);self.assertEqual(d['behavior']['rendering']['blendMode'],'hardMixPhotoshop');self.assertFalse(any(n['status']=='unsupported' and n['feature']=='hardMixPhotoshop'for n in c.brushes[0]['compatibility']));convert.validate_portable_profile(d)
  d['version']=101
  with self.assertRaises(ValueError):convert.validate_portable_profile(d)
 def test_old_hard_mix_and_modern_smudge65_remain_distinct(self):
  old=self.brush(mode='hard mix');self.assertEqual(old.brushes[0]['descriptor']['behavior']['rendering']['blendMode'],'hardMix')
  modern=self.brush(engine='colorsmudge',extra='<param name="SmudgeRateUseNewEngine">true</param>');self.assertEqual(modern.skipped,[]);d=modern.brushes[0]['descriptor'];self.assertEqual(d['version'],65);self.assertEqual(d['behavior']['rendering']['blendMode'],'normal');self.assertEqual(d['mixer']['colorRateComposite'],'hardMixPhotoshop')
 def test_portable_nonrendering_operator_rejected(self):
  d=self.brush().brushes[0]['descriptor'];d['behavior']['rendering']['blendMode']='normal';d['behavior']['grain']={'blendMode':'hardMixPhotoshop'}
  with self.assertRaises(ValueError):convert.validate_portable_profile(d)
