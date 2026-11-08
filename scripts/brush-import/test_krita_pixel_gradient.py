import io,tempfile,unittest
from pathlib import Path
from PIL import Image
import convert
from krita_import import convert_krita
from test_krita import kpp
class PixelGradientTests(unittest.TestCase):
 def make(self,side=2,extra='',engine='paintbrush'):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/'Gradient.kpp';p.write_bytes(kpp('<Brush type="png_brush" filename="tip.png" brushApplication="3" AdjustmentVersion="2"/>',resources=extra,engine=engine))
   image=io.BytesIO();Image.new('RGBA',(side,side),(80,140,200,128)).save(image,format='PNG')
   c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'tip.png':image.getvalue()});return c
 def test_native_pixel_gradient_keeps_gray_alpha_and_uses_explicit100(self):
  c=self.make();self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],100);self.assertEqual(d['tip']['color']['gradient']['sampling'],'filteredGray-v1');self.assertEqual(d['model'],'stamp');self.assertIn('gradient',d['tip']['color']);self.assertNotIn('mixer',d);self.assertNotIn('imageSampling',d['tip'])
  self.assertFalse(any(n['feature']=='brushApplication'and n['status']=='unsupported'for n in c.brushes[0]['compatibility']))
  # Full portable validator uses actual Catalog's published form in normal conversion.
  convert.validate_portable_profile(d)
 def test_wash138_is_closed_positive_direct_over100_unchanged_and_oversized_stays_rejected(self):
  over=self.make();wash=self.make(extra='<param name="PaintOpAction">2</param>')
  self.assertEqual(over.skipped,[]);self.assertEqual(wash.skipped,[]);self.assertEqual(len(over.brushes),1);self.assertEqual(len(wash.brushes),1)
  old=over.brushes[0]['descriptor'];new=wash.brushes[0]['descriptor']
  self.assertEqual(old['version'],100);self.assertEqual(new['version'],138)
  self.assertEqual(old['behavior']['rendering']['accumulation'],'directOver');self.assertEqual(new['behavior']['rendering']['accumulation'],'alphaDarken')
  self.assertEqual(new['tip']['color']['gradient']['sampling'],'filteredGray-v1')
  for key in ('tip','sizeByPressure','flowByPressure','opacityByPressure','flow','flowPer','opacity','spacing','paperInteraction'):
   self.assertEqual(new[key],old[key],key)
  self.assertEqual(wash.assets,over.assets);self.assertEqual(wash.brushes[0]['sourceDefaults'],over.brushes[0]['sourceDefaults'])
  self.assertTrue(any(n['feature']=='pixelGradientWash'and n['status']=='approximate'for n in wash.brushes[0]['compatibility']))
  convert.validate_portable_profile(old);convert.validate_portable_profile(new)
  for extra in ('','<param name="PaintOpAction">2</param>'):
   c=self.make(side=1024,extra=extra);self.assertEqual(c.brushes,[]);self.assertTrue(c.skipped);self.assertEqual(c.assets,{})

 def test_gradient_notes_distinguish_filtered_pixel_from_legacy_smudge(self):
  pixel=self.make();self.assertEqual(pixel.skipped,[])
  note=next(n['detail'] for n in pixel.brushes[0]['compatibility'] if n['feature']=='gradientTip')
  self.assertEqual(note,'Independent adjusted gray and alpha are filtered before lookup in the captured 256-sample canvas palette; palette alpha is multiplied once by filtered source alpha. Native QImage filtering kernel, ICC and colour-space rounding may differ.')
  smudge=self.make(engine='colorsmudge');self.assertEqual(smudge.skipped,[])
  descriptor=smudge.brushes[0]['descriptor'];self.assertNotIn('sampling',descriptor['tip']['color']['gradient'])
  note=next(n['detail'] for n in smudge.brushes[0]['compatibility'] if n['feature']=='gradientTip')
  self.assertEqual(note,'Adjusted gray and alpha retained;256-sample captured canvas palette is packed once per frame into premultiplied RGBA. Native maps the filtered gray dab, whereas Grafetto filters the mapped resource; nonlinear gradients and colour-space rounding may differ.')
