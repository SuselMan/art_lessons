import unittest,tempfile,copy,json,base64
from pathlib import Path
from test_krita import kpp
from krita_import import convert_krita
from smudge_record_test_helpers import assert_old_portable_and_new_import
import convert
class LegacyDodgeBurn176Tests(unittest.TestCase):
 def test_native_both_modes_preserve_legacy_rates_and_portable_closed_scope(self):
  for composite in('dodge','burn'):
   mode=0
   with self.subTest(mode=composite),tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);p=root/'Own.kpp';p.write_bytes(kpp(engine='colorsmudge',mode=composite,resources='<param name="SmudgeRateUseNewEngine">false</param><param name="PressureSmudgeRate">true</param><param name="SmudgeRateValue">0.5</param><param name="SmudgeRateMode">'+str(mode)+'</param><param name="PressureColorRate">true</param><param name="ColorRateValue">1</param><param name="PressureSize">true</param>'));out=convert.Catalog(root/'native');convert_krita(p,out,{});self.assertEqual(out.skipped,[]);d=out.brushes[0]['descriptor'];m=d['mixer'];self.assertEqual(d['version'],176);self.assertEqual(m['source'],'previousCanvas');self.assertNotIn('algorithm',m);self.assertEqual(m['foreground']['rate'],.5);self.assertEqual(m['colorRateComposite'],composite);self.assertEqual(d['behavior']['rendering']['blendMode'],'normal');self.assertNotEqual(d['sizeByPressure'],[[0,1],[1,1]])
    env={'library':out.write(),'assets':{aid:base64.b64encode((out.output/a['file']).read_bytes()).decode()for aid,a in out.assets.items()}};path=root/'own.grafetto-brushes.json';path.write_text(json.dumps(env));good=convert.Catalog(root/'portable');convert.portable_bundle(path,good);self.assertEqual(good.brushes,out.brushes)
    for key in('old','modern','projection','dulling','erase','dual','texture','timer','malformedControl','finalBlend'):
     bad=copy.deepcopy(env);b=bad['library']['brushes'][0]['descriptor']
     if key=='old':b['version']=175
     elif key=='modern':b['mixer']['algorithm']='krita-mask'
     elif key=='projection':b['mixer']['source']='projectionCanvas'
     elif key=='dulling':b['mixer']['sampling']={'mode':'adaptiveMean','radius':0}
     elif key=='erase':b['behavior']['erase']=True
     elif key=='dual':b['behavior']['dual']={}
     elif key=='texture':b['texture']={}
     elif key=='timer':b['behavior']['timing']={}
     elif key=='malformedControl':b['behavior']['modulations']={'size':[{'control':['pressure'],'minimum':0,'jitter':0}]}
     else:b['behavior']['rendering']['blendMode']='overlay'
     path.write_text(json.dumps(bad));dest=convert.Catalog(root/key)
     with self.subTest(key=key),self.assertRaises(ValueError):convert.portable_bundle(path,dest)
     self.assertEqual(dest.brushes,[]);self.assertEqual(dest.assets,{});self.assertEqual(list(dest.output.iterdir()),[])

 def test_native_combinations_promote_whole193_and_timers_remain_closed(self):
  for extra in('<param name="SmudgeRateMode">1</param>','<param name="MergedPaint">true</param>','<param name="PressureGradient">true</param>','<param name="PaintOpSettings/isAirbrushing">true</param>','<param name="AirbrushOption/isAirbrushing">true</param>'):
   with self.subTest(extra=extra),tempfile.TemporaryDirectory()as tmp:
    r=Path(tmp);p=r/'bad.kpp';p.write_bytes(kpp(engine='colorsmudge',mode='dodge',resources='<param name="SmudgeRateUseNewEngine">false</param><param name="PressureSmudgeRate">true</param><param name="SmudgeRateValue">.5</param><param name="PressureColorRate">true</param><param name="ColorRateValue">1</param>'+extra));out=convert.Catalog(r/'out')
    convert_krita(p,out,{})
    if 'isAirbrushing'in extra:
     self.assertEqual(out.brushes,[]);self.assertEqual(out.assets,{});self.assertEqual(len(out.skipped),1);self.assertIn('DodgeBurn176',str(out.skipped[0]))
    else:
     self.assertEqual(out.skipped,[]);self.assertEqual(len(out.brushes),1);d=out.brushes[0]['descriptor'];self.assertIn(d['version'],(178,193))
     if d['version']==193:
      from color_smudge193 import scope193
      self.assertTrue(scope193(d))

 def test_historical_records_portable_and_public_import_expected_changes(self):
  import hashlib
  expected=json.loads((Path(__file__).parent/'fixtures/legacy_foreground_pre176.json').read_text())
  for mode in('normal','multiply','screen','overlay','darken','lighten','add','subtract'):
   for alpha in('true','false'):
    with self.subTest(mode=mode,smearAlpha=alpha),tempfile.TemporaryDirectory()as tmp:
     r=Path(tmp);p=r/'Own.kpp';p.write_bytes(kpp(engine='colorsmudge',mode=mode,resources='<param name="SmudgeRateUseNewEngine">false</param><param name="PressureSmudgeRate">true</param><param name="SmudgeRateValue">0.5</param><param name="SmudgeRateSmearAlpha">'+alpha+'</param><param name="PressureColorRate">true</param><param name="ColorRateValue">1</param><param name="PressureSize">true</param>'));out=convert.Catalog(r/'out');convert_krita(p,out,{})
     actual={'brushes':out.brushes,'assets':out.assets,'rawCAS':{aid:hashlib.sha256((out.output/a['file']).read_bytes()).hexdigest()for aid,a in out.assets.items()}}
     assert_old_portable_and_new_import(self,expected[mode+'/'+alpha],actual,p.read_bytes(),r,'176',mode+'/'+alpha)

 def test_genuine_bitmap_alpha_mask_cas_and_portable_resources(self):
  import io
  from PIL import Image
  for mode in('dodge','burn'):
   with self.subTest(mode=mode),tempfile.TemporaryDirectory()as tmp:
    r=Path(tmp);image=Image.new('RGBA',(2,2));image.putdata([(0,0,0,a)for a in(255,0,64,128)]);raw=io.BytesIO();image.save(raw,format='PNG');p=r/'Bitmap.kpp'
    p.write_bytes(kpp('<Brush type="png_brush" filename="tip.png" brushApplication="0"/>',engine='colorsmudge',mode=mode,resources='<param name="SmudgeRateUseNewEngine">false</param><param name="PressureSmudgeRate">true</param><param name="SmudgeRateValue">.5</param><param name="PressureColorRate">true</param><param name="ColorRateValue">1</param>'));out=convert.Catalog(r/'native');convert_krita(p,out,{'tip.png':raw.getvalue()});self.assertEqual(out.skipped,[]);d=out.brushes[0]['descriptor'];self.assertEqual(d['version'],193);self.assertEqual(d['tip']['sourceGeometry'],{'version':1,'width':2,'height':2});self.assertEqual(d['tip']['kind'],'bitmap');aid=d['tip']['mask'];self.assertEqual((out.output/out.assets[aid]['file']).read_bytes(),bytes([255,0,64,128]))
    env={'library':out.write(),'assets':{a:base64.b64encode((out.output/v['file']).read_bytes()).decode()for a,v in out.assets.items()}};path=r/'bitmap.grafetto-brushes.json';path.write_text(json.dumps(env));dest=convert.Catalog(r/'portable');convert.portable_bundle(path,dest);self.assertEqual(dest.brushes,out.brushes);self.assertEqual(dest.assets,out.assets)


 def test_direct_portable_child_gate_rejects_both_before_resources(self):
  from legacy_color_smudge_dodge_burn176 import validate_legacy_color_smudge_dodge_burn176
  for mode in('dodge','burn'):
   with self.subTest(mode=mode),self.assertRaises(ValueError):validate_legacy_color_smudge_dodge_burn176({'mixer':{'colorRateComposite':mode}},1)
