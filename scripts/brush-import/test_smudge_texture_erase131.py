"""Authored bounded native PNG/KPP derivatives, not stock or native binary pixels."""
import unittest,tempfile,copy,io
import convert
from krita_import import convert_krita
from test_krita import kpp
from pathlib import Path
from PIL import Image
import test_smudge_texture103 as texture103
from krita_texture import preprocess_texture
class SmudgeTextureErase131Tests(unittest.TestCase):
 def fixture(self,root,mode=0,extra=None):
  params={'Texture/Pattern/Enabled':'true','Texture/Pattern/PatternFileName':'pattern.png','Texture/Pattern/TexturingMode':str(mode),'Texture/Pattern/UseSoftTexturing':'true','SmudgeRateUseNewEngine':'true','Texture/Pattern/AutoInvertOnErase':'true','Texture/Pattern/NeutralPoint':'.25','PressureColorRate':'true','ColorRateValue':'.7','ColorRateUseCurve':'false',**(extra or {})}
  xml=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>'for k,v in params.items())
  data=kpp('<Brush type="png_brush" filename="tip.png" brushApplication="0"/>',mode='erase',resources=xml,engine='colorsmudge')
  path=root/'original.kpp';path.write_bytes(data)
  def png(image):
   out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()
  pattern=Image.new('L',(3,2));pattern.putdata([0,51,128,192,255,32]);tip=Image.new('RGBA',(4,4),(0,0,0,128));c=convert.Catalog(root/'catalog');convert_krita(path,c,{'pattern.png':png(pattern),'tip.png':png(tip)});return c
 def test_native_pairs_and_full_portable(self):
  for mode in(0,1):
   with tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);c=self.fixture(root,mode);self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertGreaterEqual(d['version'],131);self.assertEqual(d['mixer']['colorRateComposite'],'erase');self.assertTrue(d['behavior']['erase']);self.assertNotEqual(d['texture']['id'],d['texture']['eraseId']);self.assertEqual(texture103.ModernTexture103Tests().portable(root,c).brushes[0]['descriptor'],d)
 def test_inversion_precedes_neutral_and_cutoff_literal_counterfactual(self):
  image=Image.new('L',(1,1),51)
  # .2 / (2*.25) = .4 ->102; inverted .8 mapped ->13/15 ->221.
  normal=preprocess_texture(image,neutral_point=.25).tobytes()[0]
  erased=preprocess_texture(image,neutral_point=.25,invert=True).tobytes()[0]
  self.assertEqual((normal,erased),(102,221));self.assertNotEqual(erased,255-normal)
  self.assertEqual(preprocess_texture(image,neutral_point=.25,invert=True,cutoff_policy=1,cutoff_right=200).tobytes(),bytes([0]))
  self.assertNotEqual(0,255-normal)
 def test_closed_portable_preoutput_negatives(self):
  mutations=[lambda d:d.update(version=130),lambda d:d['mixer'].update(source='projectionCanvas'),lambda d:d['mixer'].pop('algorithm'),lambda d:d['behavior'].update(dual={}),lambda d:d['behavior'].update(timing={}),lambda d:d['tip'].update(animation={}),lambda d:d['texture']['application'].update(mode='overlay'),lambda d:d.update(clone=None),lambda d:d['mixer'].update(foreground={'gradient':{'rate':1}})]
  for mutation in mutations:
   with tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);c=self.fixture(root);self.assertEqual(c.skipped,[]);d=copy.deepcopy(c.brushes[0]['descriptor']);mutation(d)
    with self.assertRaises(ValueError):texture103.ModernTexture103Tests().portable(root,c,d)
    self.assertFalse(list((root/'portable').rglob('*.bin')))
 def test_native_scope_no_silent_foreign_modern_projection_pair(self):
  for extra in({'MergedPaint':'true'},{'PressureGradient':'true','GradientValue':'.5'}):
   with tempfile.TemporaryDirectory()as tmp:
    c=self.fixture(Path(tmp),0,extra);self.assertEqual(c.brushes,[]);self.assertEqual(len(c.skipped),1)
 def test_old_modes_without_auto_and_legacy_are_unchanged(self):
  for mode in(0,1):
   with tempfile.TemporaryDirectory()as tmp:
    c=self.fixture(Path(tmp),mode,{'Texture/Pattern/AutoInvertOnErase':'false'});self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertNotIn('eraseId',d['texture']);self.assertEqual(d['version'],88)

 def test_raw109_color_fallback_does_not_gain131_pair(self):
  for mode in(2,3):
   with tempfile.TemporaryDirectory()as tmp:
    c=self.fixture(Path(tmp),mode);self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],88);self.assertNotIn('eraseId',d['texture']);self.assertEqual(d['texture']['application']['mode'],'subtract');self.assertTrue(any(n['feature']=='nativeTextureModeFallback'for n in c.brushes[0]['compatibility']))

 def test_malformed_rendering_is_closed_helper_and_portable_preoutput(self):
  from smudge_texture_erase131 import smudge_texture_erase131_scope
  for render in(None,[],[1],0,'buildUp',True):
   with self.subTest(render=render),tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);c=self.fixture(root);self.assertEqual(c.skipped,[]);d=copy.deepcopy(c.brushes[0]['descriptor']);d['behavior']['rendering']=render
    self.assertIs(smudge_texture_erase131_scope(d),False)
    with self.assertRaises(ValueError):texture103.ModernTexture103Tests().portable(root,c,d)
    self.assertFalse(list((root/'portable').rglob('*.bin')))

 def test_old88_malformed_mixer_behavior_rendering_rejects_beforeoutputs(self):
  for field,value in([('rendering',v)for v in(None,[],[1],0,'buildUp',True)]+[('behavior',v)for v in(None,[],0)]):
   with self.subTest(field=field,value=value),tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);c=self.fixture(root,extra={'Texture/Pattern/AutoInvertOnErase':'false'});self.assertEqual(c.skipped,[]);d=copy.deepcopy(c.brushes[0]['descriptor']);self.assertEqual(d['version'],88)
    if field=='behavior':d['behavior']=value
    else:d['behavior']['rendering']=value
    with self.assertRaises(ValueError):convert.validate_portable_mixer(d)
    with self.assertRaises(ValueError):texture103.ModernTexture103Tests().portable(root,c,d)
    self.assertFalse(list((root/'portable').rglob('*.bin')))
