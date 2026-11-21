"""Independent authored Pixel Greater fixture; no vendor brush data."""
import copy,tempfile,unittest
from pathlib import Path
from brush_contract import Catalog
from krita_import import preset
from test_krita import kpp
from convert import validate_portable_profile
class PixelGreater198(unittest.TestCase):
 def test_pixel_wash_uses_final_greater_and_portable_boundaries(self):
  with tempfile.TemporaryDirectory() as tmp:
   row=preset(kpp(resources='<param name="PaintOpAction">2</param>',mode='greater'),'greater.kpp',Catalog(Path(tmp)),{});d=row['descriptor'];self.assertEqual(d['version'],198);self.assertEqual(d['behavior']['rendering']['pixelComposite'],'greater');self.assertEqual(d['behavior']['rendering']['accumulation'],'alphaDarken');self.assertFalse(any(n['status']=='unsupported' for n in row['compatibility']));validate_portable_profile(d)
   for mutate in (lambda x:x.update(version=74),lambda x:x.update(texture={}),lambda x:x['behavior'].update(dual={}),lambda x:x['behavior']['rendering'].update(accumulation='directOver')):
    bad=copy.deepcopy(d);mutate(bad)
    with self.assertRaises(ValueError):validate_portable_profile(bad)
 def test_direct_greater_remains_explicitly_unsupported(self):
  with tempfile.TemporaryDirectory() as tmp:
   row=preset(kpp(resources='<param name="PaintOpAction">1</param>',mode='greater'),'greater.kpp',Catalog(Path(tmp)),{});self.assertNotIn('pixelComposite',row['descriptor']['behavior']['rendering']);self.assertTrue(any(n['status']=='unsupported' and n['feature']=='blendMode' for n in row['compatibility']))
