import io,tempfile,unittest,xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile
from PIL import Image,PngImagePlugin
from brush_contract import Catalog
from krita_import import convert_krita
from test_animated_alpha_child184 import AnimatedAlphaChild184Tests
from test_sketch_gih174 import pipe174

def source(action='1', enabled='true'):
 image=Image.open(io.BytesIO(AnimatedAlphaChild184Tests().raw('multiply')));image.load();root=ET.fromstring(image.info['preset'])
 for name,value in [('PaintOpAction',action),('MaskingBrush/Enabled',enabled)]:
  p=next(p for p in root.findall('param') if p.get('name')==name)
  if value is None:root.remove(p)
  else:p.text=value
 meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(root,encoding='unicode'));result=io.BytesIO();image.save(result,format='PNG',pnginfo=meta);return result.getvalue()

class PixelBuildUpMaskGuardTests(unittest.TestCase):
 def test_build_up_and_adjacent(self):
  resource={'own184.gih':pipe174('constant')}
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   for action,enabled,reject in [('1','true',True),('1','1',True),(None,'true',True),('2','true',False),('1','false',False),('1','0',False)]:
    with self.subTest(action=action,enabled=enabled):
     path=root/'test.kpp';path.write_bytes(source(action,enabled));c=Catalog(root/(str(action)+enabled));convert_krita(path,c,resource)
     if reject:
      self.assertEqual(c.brushes,[]);self.assertEqual(c.skipped[0]['reasons'],['Native Pixel Build-up with masking brush is unsupported']);self.assertFalse(c.assets)
     else:
      self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),1);self.assertEqual('dual' in c.brushes[0]['descriptor']['behavior'],action=='2')
 def test_bundle_keeps_neighbors(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);path=root/'cases.bundle'
   with ZipFile(path,'w') as z:
    z.writestr('a.kpp',source('1','true'));z.writestr('b.kpp',source('2','true'));z.writestr('c.kpp',source('1','false'));z.writestr('own184.gih',pipe174('constant'))
   c=Catalog(root/'out');convert_krita(path,c)
   self.assertEqual([item['name'] for item in c.skipped],['a']);self.assertEqual([x['source'] for x in c.brushes],['b.kpp','c.kpp']);self.assertIn('dual',c.brushes[0]['descriptor']['behavior']);self.assertNotIn('dual',c.brushes[1]['descriptor']['behavior'])
