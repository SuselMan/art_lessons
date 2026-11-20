import tempfile, unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from test_krita import kpp

class RectangleTests(unittest.TestCase):
 def brush(self, generator, shape, extra='', params=None):
  definition=f'<Brush type="auto_brush"><MaskGenerator id="{generator}" type="{shape}" ratio=".6" diameter="40" spikes="2" antialiasEdges="1" hfade=".4" vfade=".8" {extra}/></Brush>'
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'Authored.kpp';p.write_bytes(kpp(definition,resources=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>'for k,v in(params or{}).items())));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
   self.assertEqual(c.skipped,[])
   d=c.brushes[0]['descriptor'];convert.validate_portable_profile(d)
   return d
 def test_gaussian_rectangle_and_ellipse_preserve_independent_fades(self):
  for shape in ('rect','circle'):
   d=self.brush('gauss',shape);p=d['tip']['profile']
   self.assertEqual(p['kind'],'gaussian2D');self.assertEqual(p['shape'],'rectangle'if shape=='rect'else'ellipse')
   self.assertEqual((p['horizontalFade'],p['verticalFade']),(.4,.8));self.assertTrue(p['antialias']);self.assertGreaterEqual(d['version'],78)
 def test_soft_rectangle_uses_separable_curve(self):
  d=self.brush('soft','rect','softness=".7" curve="0,1;1,0"')
  self.assertEqual(d['tip']['profile']['kind'],'curveRectangle');self.assertGreaterEqual(d['version'],79)
 def test_new_profile_requires_its_revision(self):
  d=self.brush('gauss','rect');d['version']=77
  with self.assertRaises(ValueError):convert.validate_portable_profile(d)

 def test_unadmitted_dual_profiles_keep_prior_bitmap_instead_of_invalid_library(self):
  child='<Brush type="auto_brush"><MaskGenerator id="default" type="circle" ratio="1" diameter="20" spikes="2"/></Brush>'
  params={'MaskingBrush/Enabled':'true','MaskingBrush/Preset/brush_definition':child}
  for generator,extra in [('gauss',''),('soft','softness_curve="0,1;1,0"')]:
   d=self.brush(generator,'rect',extra,params)
   self.assertEqual(d['tip']['kind'],'bitmap');self.assertNotIn('profile',d['tip'])
   self.assertIn('dual',d['behavior'])
