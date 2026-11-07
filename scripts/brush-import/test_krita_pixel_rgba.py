import io, tempfile, unittest
from pathlib import Path
from PIL import Image
import convert
from krita_import import convert_krita
from test_krita import kpp
class PixelRgbaTests(unittest.TestCase):
 def test_original_colour_survives_import_instead_of_foreground_mask(self):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/'Own.kpp';p.write_bytes(kpp('<Brush type="png_brush" filename="tip.png" brushApplication="1"/>'))
   out=io.BytesIO();im=Image.new('RGBA',(2,2));im.putdata([(200,100,50,128),(10,20,30,255),(255,0,0,0),(100,150,200,64)]);im.save(out,format='PNG')
   c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'tip.png':out.getvalue()})
   self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor']
   self.assertEqual(d['version'],84);self.assertEqual(d['model'],'stamp')
   self.assertEqual(len(d['tip']['color']['planes']),3);self.assertNotIn('imageSampling',d['tip'])
   self.assertNotIn('mixer',d);self.assertTrue(any(n['feature']=='pixelOriginalRgba'for n in c.brushes[0]['compatibility']))
