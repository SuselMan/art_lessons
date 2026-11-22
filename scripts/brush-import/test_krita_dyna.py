import copy,json,tempfile,unittest
from pathlib import Path
from PIL import Image,PngImagePlugin
from brush_contract import Catalog
from krita_import import convert_krita
from convert import portable_bundle

class DynaImport(unittest.TestCase):
 def test_native_two_circles_and_alias_are_not_silently_discarded(self):
  cases=[('',False),('<param name="Dyna/useTwoCirles">false</param>',False),('<param name="Dyna/useTwoCirles">true</param>',True),('<param name="Dyna/useTwoCircles">false</param>',False),('<param name="Dyna/useTwoCircles">true</param>',True),('<param name="Dyna/useTwoCirles">true</param><param name="Dyna/useTwoCircles">false</param>',True),('<param name="Dyna/useTwoCirles">false</param><param name="Dyna/useTwoCircles">true</param>',True)]
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   for i,(fields,rejected) in enumerate(cases):
    with self.subTest(fields=fields):
     path=root/f'{i}.kpp';p=PngImagePlugin.PngInfo();p.add_text('preset','<Preset name="Dyna" paintopid="dynabrush"><param name="Dyna/action">0</param><param name="Dyna/diameter">3</param>'+fields+'</Preset>');Image.new('RGB',(2,2)).save(path,format='PNG',pnginfo=p)
     c=Catalog(root/f'out{i}');convert_krita(path,c)
     self.assertEqual(bool(c.skipped),rejected);self.assertEqual(bool(c.brushes),not rejected)
     if rejected:self.assertIn('single-circle',c.skipped[0]['reasons'][0])

 def test_circle_roundtrip_and_rejected_action(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);path=root/'own.kpp'
   def write(action):
    p=PngImagePlugin.PngInfo();p.add_text('preset','<Preset name="Dyna" paintopid="dynabrush"><param name="Dyna/action">'+action+'</param><param name="Dyna/diameter">3</param><param name="Dyna/drag">0.65</param><param name="Dyna/mass">0</param></Preset>');Image.new('RGB',(2,2)).save(path,format='PNG',pnginfo=p)
   write('0');c=Catalog(root/'native');convert_krita(path,c);self.assertFalse(c.skipped);self.assertEqual(c.brushes[0]['descriptor']['version'],210)
   env={'library':c.write(),'assets':{}};f=root/'portable.json';f.write_text(json.dumps(env));out=Catalog(root/'out');portable_bundle(f,out);self.assertEqual(out.brushes,c.brushes)
   bad=copy.deepcopy(env);bad['library']['brushes'][0]['descriptor']['dyna']['diameter']=2;f.write_text(json.dumps(bad))
   with self.assertRaises(ValueError):portable_bundle(f,Catalog(root/'bad'))
   write('1');rejected=Catalog(root/'rejected');convert_krita(path,rejected);self.assertTrue(rejected.skipped);self.assertFalse(rejected.brushes)
