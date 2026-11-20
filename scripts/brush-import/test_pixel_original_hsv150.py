import io,tempfile,unittest,copy,json,base64
from pathlib import Path
from PIL import Image
import convert
from krita_import import convert_krita
from test_krita import kpp
class PixelOriginalHsv150Tests(unittest.TestCase):
 def test_native_controls_retained_and_portable_closed_before_output(self):
  for sensor in ('pressure','fuzzy'):
   with self.subTest(sensor=sensor),tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);p=root/'Own.kpp';p.write_bytes(kpp('<Brush type="png_brush" filename="tip.png" brushApplication="1"/>',resources='<param name="Pressureh">true</param><param name="hSensor">&lt;params id="'+sensor+'"/&gt;</param><param name="hUseCurve">true</param><param name="hValue">1</param>'))
    png=io.BytesIO();im=Image.new('RGBA',(2,2));im.putdata([(200,100,50,128),(10,20,30,255),(255,0,0,0),(100,150,200,64)]);im.save(png,format='PNG')
    out=convert.Catalog(root/'native');convert_krita(p,out,{'tip.png':png.getvalue()});self.assertEqual(out.skipped,[]);d=out.brushes[0]['descriptor'];self.assertEqual(d['version'],150);self.assertEqual(d['tip']['color']['adjustmentPolicy'],'native-image-stamp-v1');self.assertIn('hue',d['behavior']['colorAdjustment'])
    env={'library':out.write(),'assets':{aid:base64.b64encode((out.output/a['file']).read_bytes()).decode()for aid,a in out.assets.items()}};path=root/'own.grafetto-brushes.json';path.write_text(json.dumps(env));good=convert.Catalog(root/'portable');convert.portable_bundle(path,good);self.assertEqual(good.brushes,out.brushes)
    for case in ('downgrade','erase','wrongPolicy','genericHue'):
     bad=copy.deepcopy(env);b=bad['library']['brushes'][0]['descriptor']
     if case=='downgrade':b['version']=149
     elif case=='erase':b['behavior']['erase']=True
     elif case=='wrongPolicy':b['tip']['color']['adjustmentPolicy']='recolor'
     else:b['behavior'].setdefault('dynamics',{})['hue']={'control':'pressure','minimum':0,'jitter':0}
     path.write_text(json.dumps(bad));dest=convert.Catalog(root/case)
     with self.subTest(case=case),self.assertRaises(ValueError):convert.portable_bundle(path,dest)
     self.assertEqual(dest.brushes,[]);self.assertEqual(dest.assets,{})
