import unittest,tempfile,json,copy,base64,io,os
from pathlib import Path
from PIL import Image,PngImagePlugin
import convert
from krita_import import convert_krita
from child_absolute_size187 import locked_child_absolute_size189_scope,independent_child_absolute_size187_scope
class LockedChild189Tests(unittest.TestCase):
 def import189(self,tmp):
  old=Path(os.environ['OLD187']);im=Image.open(old/'Own187.kpp');text=im.info['preset'];assert 'lockedAngleMode="0"'in text;text=text.replace('lockedAngleMode="0"','lockedAngleMode="1"');meta=PngImagePlugin.PngInfo();meta.add_text('preset',text);out=io.BytesIO();im.save(out,format='PNG',pnginfo=meta);f=Path(tmp)/'Own189.kpp';f.write_bytes(out.getvalue());c=convert.Catalog(Path(tmp)/'native');convert_krita(f,c);return c
 def test_genuine_locked_native_and_portable_whole(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=self.import189(tmp);self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual((d['version'],d['behavior']['dual']['brush']['version']),(189,189));self.assertTrue(locked_child_absolute_size189_scope(d));self.assertFalse(independent_child_absolute_size187_scope(d));lib=c.write();env={'library':lib,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in lib['assets']}};f=Path(tmp)/'x.grafetto-brushes.json';f.write_text(json.dumps(env));out=convert.Catalog(Path(tmp)/'portable');convert.portable_bundle(f,out);self.assertEqual(out.write(),lib)
 def test_new189_scope_portable_negatives_preoutput(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=self.import189(tmp);lib=c.write();env={'library':lib,'assets':{}};f=Path(tmp)/'x.grafetto-brushes.json'
   for i,change in enumerate([lambda d:d.update(version=187),lambda d:d['behavior']['dual']['brush']['behavior']['modulations']['size'][0]['combine']['absolute'].update(locked=False),lambda d:d['behavior']['dual'].update(sampling='inline'),lambda d:d['behavior']['dual']['brush']['behavior']['modulations'].update(opacity=d['behavior']['dual']['brush']['behavior']['modulations']['size'])]):
    bad=copy.deepcopy(env);change(bad['library']['brushes'][0]['descriptor']);f.write_text(json.dumps(bad));out=convert.Catalog(Path(tmp)/('bad'+str(i)))
    with self.assertRaises(ValueError):convert.portable_bundle(f,out)
    self.assertEqual(list(out.output.iterdir()),[])
 def test_old187_whole_record_unchanged(self):
  old=Path(os.environ['OLD187'])
  with tempfile.TemporaryDirectory()as tmp:
   c=convert.Catalog(Path(tmp)/'native');convert_krita(old/'Own187.kpp',c);self.assertEqual(c.write(),json.loads((old/'native-library.json').read_text()))
