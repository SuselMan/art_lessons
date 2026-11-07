import io,tempfile,unittest
from pathlib import Path
from PIL import Image
import convert
from krita_import import convert_krita
from test_krita import kpp
class PixelGradientTests(unittest.TestCase):
 def make(self,side=2,extra=''):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/'Gradient.kpp';p.write_bytes(kpp('<Brush type="png_brush" filename="tip.png" brushApplication="3" AdjustmentVersion="2"/>',resources=extra))
   image=io.BytesIO();Image.new('RGBA',(side,side),(80,140,200,128)).save(image,format='PNG')
   c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'tip.png':image.getvalue()});return c
 def test_pixel_gradient_keeps_gray_alpha_and_requires97(self):
  c=self.make();self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],97);self.assertEqual(d['model'],'stamp');self.assertIn('gradient',d['tip']['color']);self.assertNotIn('mixer',d);self.assertNotIn('imageSampling',d['tip'])
  self.assertFalse(any(n['feature']=='brushApplication'and n['status']=='unsupported'for n in c.brushes[0]['compatibility']))
  # Full portable validator uses actual Catalog's published form in normal conversion.
  convert.validate_portable_profile(d)
 def test_wash_and_oversized_are_explicitly_not_admitted(self):
  for kwargs in ({'side':1024},{'extra':'<param name="PaintOpAction">2</param>'}):
   c=self.make(**kwargs);self.assertEqual(c.brushes,[]);self.assertTrue(c.skipped)
