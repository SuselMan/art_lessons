"""Authored KPP/PNG; real importer and full portable roundtrip, not parsed mocks."""
import unittest,tempfile,io,copy,json,base64
from pathlib import Path
from PIL import Image
import convert
from test_krita import kpp
from krita_import import convert_krita
class ModernTexture103Tests(unittest.TestCase):
 def fixture(self,root,mode=4,extra=None):
  params={'Texture/Pattern/Enabled':'true','Texture/Pattern/PatternFileName':'pattern.png','Texture/Pattern/TexturingMode':str(mode),'Texture/Pattern/UseSoftTexturing':'true','SmudgeRateUseNewEngine':'true','SizeUseCurve':'false',**(extra or {})}
  # test_krita.kpp already supplies SizeUseCurve: replace it exactly once.
  params.pop('SizeUseCurve');xml=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>'for k,v in params.items())
  data=kpp('<Brush type="png_brush" filename="tip.png" brushApplication="0"/>',resources=xml,engine='colorsmudge')
  path=root/'original.kpp';path.write_bytes(data)
  def png(image):
   out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()
  pattern=Image.new('L',(3,2));pattern.putdata([0,64,128,192,255,32])
  tip=Image.new('RGBA',(4,4),(0,0,0,128));c=convert.Catalog(root/'catalog')
  convert_krita(path,c,{'pattern.png':png(pattern),'tip.png':png(tip)});return c
 def portable(self,root,c,descriptor=None):
  lib={'schemaVersion':1,'brushes':copy.deepcopy(c.brushes),'assets':list(c.assets.values()),'skipped':[]}
  if descriptor:lib['brushes'][0]['descriptor']=descriptor
  value={'library':lib,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in lib['assets']}}
  path=root/'fixture.grafetto-brushes.json';path.write_text(json.dumps(value));out=convert.Catalog(root/'portable');convert.portable_bundle(path,out);return out
 def test_all_native_modes_and_old_multiply_subtract_full_portable(self):
  for raw,name in [(0,'multiply'),(1,'subtract'),(4,'darken'),(5,'overlay'),(8,'linearDodge'),(9,'linearBurn')]:
   with self.subTest(raw=raw),tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);c=self.fixture(root,raw);self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['texture']['application'],{'mode':name,'soft':True});self.assertEqual(d['mixer']['algorithm'],'krita-mask');self.assertEqual(d['version']>=103,raw>1);out=self.portable(root,c);self.assertEqual(out.brushes[0]['descriptor'],d)
 def test_native_combinations_reject_instead_of_old_subtract_fallback(self):
  for extra in [{'SmudgeRateUseNewEngine':'false'},{'MergedPaint':'true'}]:
   with self.subTest(extra=extra),tempfile.TemporaryDirectory()as tmp:
    c=self.fixture(Path(tmp),4,extra);self.assertEqual(c.brushes,[]);self.assertEqual(len(c.skipped),1);self.assertIn('texture103',str(c.skipped))
 def test_portable_downgrade_projection_animation_and_foreground_rejected(self):
  for mutation in [lambda d:d.update(version=102),lambda d:d['mixer'].update(source='projectionCanvas'),lambda d:d['mixer'].update(colorRateComposite='hardMixPhotoshop'),lambda d:d['tip'].update(animation={'mode':'incremental','frames':[d['tip']['mask']]})]:
   with tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);c=self.fixture(root);d=copy.deepcopy(c.brushes[0]['descriptor']);mutation(d)
    with self.assertRaises(ValueError):self.portable(root,c,d)
 def test_hard_soft_strength_and_pure_dulling_foreground_are_independent(self):
  for soft in ['false','true']:
   for dull in ['0','1']:
    with tempfile.TemporaryDirectory()as tmp:
     c=self.fixture(Path(tmp),8,{'Texture/Pattern/UseSoftTexturing':soft,'PressureTexture/Strength/':'true','Texture/Strength/Value':'.25','SmudgeRateMode':dull,'PressureColorRate':'true','ColorRateValue':'.7','ColorRateUseCurve':'false'})
     self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['texture']['strength'],.25);self.assertEqual(d['texture']['application']['soft'],soft=='true');self.assertEqual(d['mixer']['foreground']['rate'],.7)
