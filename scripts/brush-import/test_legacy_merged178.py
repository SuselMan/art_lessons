import unittest,tempfile,json,base64,copy
from pathlib import Path
from test_krita import kpp
from krita_import import convert_krita
import convert
MODES=('overlay','darken','lighten','add','subtract','dodge','burn')
def raw(mode,extra=''):
 return kpp(engine='colorsmudge',mode=mode,resources='<param name="SmudgeRateUseNewEngine">false</param><param name="PressureSmudgeRate">true</param><param name="SmudgeRateValue">.5</param><param name="PressureColorRate">true</param><param name="ColorRateValue">1</param><param name="PressureSize">true</param>'+extra)
def record(out):
 import hashlib
 return {'brushes':out.brushes,'assets':out.assets,'rawCAS':{a:hashlib.sha256((out.output/v['file']).read_bytes()).hexdigest()for a,v in out.assets.items()}}
class Merged178(unittest.TestCase):
 def test_native_seven_and_portable_whole_closed(self):
  for mode in MODES:
   with self.subTest(mode=mode),tempfile.TemporaryDirectory()as tmp:
    r=Path(tmp);p=r/'Own.kpp';p.write_bytes(raw(mode,'<param name="MergedPaint">true</param>'));out=convert.Catalog(r/'native');convert_krita(p,out,{});self.assertEqual(out.skipped,[]);d=out.brushes[0]['descriptor'];self.assertEqual(d['version'],178);self.assertEqual(d['mixer']['source'],'projectionCanvas');self.assertEqual(d['mixer']['colorRateComposite'],mode);self.assertEqual(d['mixer']['foreground']['rate'],.5);self.assertNotEqual(d['sizeByPressure'],[[0,1],[1,1]]);env={'library':out.write(),'assets':{aid:base64.b64encode((out.output/a['file']).read_bytes()).decode()for aid,a in out.assets.items()}};path=r/'out.grafetto-brushes.json';path.write_text(json.dumps(env));dest=convert.Catalog(r/'portable');convert.portable_bundle(path,dest);self.assertEqual(dest.brushes,out.brushes)
    for key in('old','modern','sampling','erase','timer','child'):
     bad=copy.deepcopy(env);b=bad['library']['brushes'][0]['descriptor']
     if key=='old':b['version']=177
     elif key=='modern':b['mixer']['algorithm']='krita-mask'
     elif key=='sampling':b['mixer']['sampling']={'mode':'adaptiveMean','radius':0}
     elif key=='erase':b['behavior']['erase']=True
     elif key=='timer':b['behavior']['timing']={}
     else:
      from legacy_color_smudge_overlay154 import validate_legacy_color_smudge_overlay154
      from legacy_color_smudge_minmax172 import validate_legacy_color_smudge_minmax172
      from legacy_color_smudge_arithmetic175 import validate_legacy_color_smudge_arithmetic175
      from legacy_color_smudge_dodge_burn176 import validate_legacy_color_smudge_dodge_burn176
      fn=validate_legacy_color_smudge_overlay154 if mode=='overlay'else validate_legacy_color_smudge_minmax172 if mode in('darken','lighten')else validate_legacy_color_smudge_arithmetic175 if mode in('add','subtract')else validate_legacy_color_smudge_dodge_burn176
      with self.assertRaises(ValueError):fn(b,1)
      continue
     path.write_text(json.dumps(bad));denied=convert.Catalog(r/key)
     with self.assertRaises(ValueError):convert.portable_bundle(path,denied)
     self.assertEqual(denied.brushes,[]);self.assertEqual(list(denied.output.iterdir()),[])
 def test_whole_local_default_false_and_old85_projection_preserved(self):
  expected=json.loads((Path(__file__).parent/'pre178-records.json').read_text())
  for mode in MODES+('multiply','screen'):
   for flag in('absent','false')+ (('true',)if mode in('multiply','screen')else()):
    with self.subTest(mode=mode,flag=flag),tempfile.TemporaryDirectory()as tmp:
     r=Path(tmp);p=r/'Own.kpp';p.write_bytes(raw(mode,''if flag=='absent'else'<param name="MergedPaint">'+flag+'</param>'));out=convert.Catalog(r/'out');convert_krita(p,out,{});self.assertEqual(record(out),expected[mode+'/'+flag])
 def test_native_incompatible_active_options_stay_preoutput_denied(self):
  for mode in MODES:
   for extra in('<param name="SmudgeRateMode">1</param>','<param name="PaintOpSettings/isAirbrushing">true</param>','<param name="AirbrushOption/isAirbrushing">true</param>'):
    with self.subTest(mode=mode,extra=extra),tempfile.TemporaryDirectory()as tmp:
     r=Path(tmp);p=r/'bad.kpp';p.write_bytes(raw(mode,'<param name="MergedPaint">true</param>'+extra));out=convert.Catalog(r/'out');convert_krita(p,out,{});self.assertEqual(out.brushes,[]);self.assertEqual(out.assets,{});self.assertEqual(len(out.skipped),1)
