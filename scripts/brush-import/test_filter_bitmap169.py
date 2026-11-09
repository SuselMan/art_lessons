"""Actual authored KPP+embedded PNG ALPHAMASK; no synthetic production admission bypass."""
import unittest,tempfile,base64,json,copy,io
from PIL import Image
from pathlib import Path
from test_krita import kpp
from krita_import import convert_krita
import convert
class Bitmap169(unittest.TestCase):
 def native(self,root):
  # Native ordinary ALPHAMASK is inverse-gray times alpha; black preserves alpha.
  image=Image.new('RGBA',(2,2));image.putdata([(0,0,0,a)for a in[255,0,64,128]]);stream=io.BytesIO();image.save(stream,format='PNG');raw=stream.getvalue()
  resources='<param name="Filter/id">invert</param><param name="Filter/smudgeMode">true</param><resources><resource filename="tip.png" type="brushes">'+base64.b64encode(raw).decode()+'</resource></resources>'
  f=root/'Own169.kpp';f.write_bytes(kpp('<Brush type="png_brush" filename="tip.png" spacing="0.1" brushApplication="0"/>',resources,engine='filter',mode='copy'));c=convert.Catalog(root/'out');convert_krita(f,c,{});return c
 def test_genuine_mask_alpha_and_portable_closed(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);c=self.native(root);self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],169);self.assertEqual(d['filter']['maskPolicy'],'bitmap-alpha-v1');self.assertEqual(d['tip']['kind'],'bitmap');self.assertNotIn('color',d['tip']);mask=c.assets[d['tip']['mask']];self.assertEqual((c.output/mask['file']).read_bytes(),bytes([255,0,64,128]))
   env={'library':c.write(),'assets':{a:base64.b64encode((c.output/v['file']).read_bytes()).decode()for a,v in c.assets.items()}};f=root/'own.grafetto-brushes.json';f.write_text(json.dumps(env));good=convert.Catalog(root/'good');convert.portable_bundle(f,good);self.assertEqual(good.brushes,c.brushes)
   for case in ['downgrade','color','dual','erase','texture','kind','policy']:
    bad=copy.deepcopy(env);b=bad['library']['brushes'][0]['descriptor']
    if case=='downgrade':b['version']=147
    elif case=='color':b['tip']['color']={'planes':[b['tip']['mask']]*3}
    elif case=='dual':b['behavior']['dual']={}
    elif case=='erase':b['behavior']['erase']=True
    elif case=='texture':b['texture']={}
    elif case=='kind':b['filter']['kind']='posterize';b['filter']['steps']=4
    else:b['filter'].pop('maskPolicy')
    f.write_text(json.dumps(bad));dest=convert.Catalog(root/case)
    with self.subTest(case=case),self.assertRaises(ValueError):convert.portable_bundle(f,dest)
    self.assertEqual(dest.brushes,[]);self.assertEqual(dest.assets,{})
