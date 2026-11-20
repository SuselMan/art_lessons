import unittest,tempfile,copy,json,base64
from pathlib import Path
from test_krita import kpp
from krita_import import convert_krita
import convert
class LegacyOverlay154Tests(unittest.TestCase):
 def test_native_both_modes_preserve_legacy_rates_and_portable_closed_scope(self):
  for mode in(0,1):
   with self.subTest(mode=mode),tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);p=root/'Own.kpp';p.write_bytes(kpp(engine='colorsmudge',mode='overlay',resources='<param name="SmudgeRateUseNewEngine">false</param><param name="PressureSmudgeRate">true</param><param name="SmudgeRateValue">0.5</param><param name="SmudgeRateMode">'+str(mode)+'</param><param name="PressureColorRate">true</param><param name="ColorRateValue">1</param><param name="PressureSize">true</param>'));out=convert.Catalog(root/'native');convert_krita(p,out,{});self.assertEqual(out.skipped,[]);d=out.brushes[0]['descriptor'];m=d['mixer'];self.assertEqual(d['version'],154);self.assertEqual(m['source'],'previousCanvas');self.assertNotIn('algorithm',m);self.assertEqual(m['foreground']['rate'],.5);self.assertEqual(m['colorRateComposite'],'overlay');self.assertEqual(d['behavior']['rendering']['blendMode'],'normal');self.assertNotEqual(d['sizeByPressure'],[[0,1],[1,1]])
    env={'library':out.write(),'assets':{aid:base64.b64encode((out.output/a['file']).read_bytes()).decode()for aid,a in out.assets.items()}};path=root/'own.grafetto-brushes.json';path.write_text(json.dumps(env));good=convert.Catalog(root/'portable');convert.portable_bundle(path,good);self.assertEqual(good.brushes,out.brushes)
    for key in('old','modern','projection','erase','dual','texture','timer','finalBlend'):
     bad=copy.deepcopy(env);b=bad['library']['brushes'][0]['descriptor']
     if key=='old':b['version']=153
     elif key=='modern':b['mixer']['algorithm']='krita-mask'
     elif key=='projection':b['mixer']['source']='projectionCanvas'
     elif key=='erase':b['behavior']['erase']=True
     elif key=='dual':b['behavior']['dual']={}
     elif key=='texture':b['texture']={}
     elif key=='timer':b['behavior']['timing']={}
     else:b['behavior']['rendering']['blendMode']='overlay'
     path.write_text(json.dumps(bad));dest=convert.Catalog(root/key)
     with self.subTest(key=key),self.assertRaises(ValueError):convert.portable_bundle(path,dest)
     self.assertEqual(dest.brushes,[]);self.assertEqual(dest.assets,{})
