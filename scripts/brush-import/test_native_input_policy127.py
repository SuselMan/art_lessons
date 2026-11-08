"""Bounded default native-input entry; no redistributed Krita bitmap artwork.

The8 controls use exact option strings from pinned original PNGs; fixtures are
self-authored tiny static masks, not a claim of originalPNG/CAS integration.
Actual originals/resource hashes are covered by separate stock CAPS PREP.
"""
from pathlib import Path
import copy,hashlib,json,tempfile,unittest,sys
from unittest.mock import patch
import convert,krita_stock
from krita_import import convert_krita,preset,DEFAULT_NATIVE_INPUT_POLICY
from test_krita_size_strength import authored

FIXTURE=Path(__file__).with_name('fixtures')/'native_input127_stock_controls.json'
class NativeDefault127Tests(unittest.TestCase):
 def imported(self,root,params,**flags):
  path=root/'Own127.kpp';raw=authored(params);path.write_bytes(raw);out=convert.Catalog(root/'out');convert_krita(path,out,**flags);self.assertEqual(out.skipped,[]);return out,raw
 def identity(self,d,raw):
  rendering={k:v for k,v in d.items()if k!='id'};payload={'schemaVersion':1,'importerRenderingVersion':3,'sourceSettingsSha256':hashlib.sha256(raw).hexdigest(),'rendering':rendering};self.assertEqual(d['id'],'imported-'+hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()[:24])
 def test_default8_genuine_option_sets_activate_existing81_rate_and_source_time_roles(self):
  fixture=json.loads(FIXTURE.read_text());self.assertEqual(fixture['nativeCommit'],'bd6e8d061d2f0388c5b10278786cf0fe62e3135f');self.assertEqual(len(fixture['presets']),8)
  for row in fixture['presets']:
   with self.subTest(name=row['name']),tempfile.TemporaryDirectory()as tmp:
    params=row['controls'];self.assertEqual(hashlib.sha256(json.dumps(params,sort_keys=True,separators=(',',':')).encode()).hexdigest(),row['controlsSha256']);out,raw=self.imported(Path(tmp),params);d=out.brushes[0]['descriptor'];self.identity(d,raw);self.assertGreaterEqual(d['version'],81);self.assertEqual(d['behavior']['timing']['rate'],row['expectedRate']);self.assertTrue(any(n['feature']=='airbrushFuzzyRefresh'and n['status']=='supported'for n in out.brushes[0]['compatibility']));self.assertNotIn('strokeInput',d['behavior'])
    def visit(v):
     if isinstance(v,dict):
      if v.get('control')=='random':self.assertEqual(v['randomSource']['kind'],'grafettoSourceTime-v1');self.assertTrue(v['randomSource']['key'].startswith('behavior/'))
      for key,value in v.items():
       if key!='brush':visit(value)
     elif isinstance(v,list):
      for value in v:visit(value)
    visit(d['behavior'])
 def test_default_matches_existing_explicit_true_but_explicit_false_is_exact_old_descriptor_and_identity(self):
  params={'PaintOpSettings/isAirbrushing':'true','PaintOpSettings/rate':'25','PressureSize':'true','SizeSensor':'<params id="fuzzy"/>'}
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp)
   for label in ['default','on','off']:(root/label).mkdir()
   default,raw=self.imported(root/'default',params);on,_=self.imported(root/'on',params,timed_input=True);off,_=self.imported(root/'off',params,timed_input=False);self.assertEqual(default.brushes,on.brushes);self.assertNotIn('timing',off.brushes[0]['descriptor']['behavior']);legacy=preset(raw,'Own127.kpp',convert.Catalog(root/'legacy'),{});self.assertEqual(off.brushes,[legacy]);self.identity(off.brushes[0]['descriptor'],raw);self.assertNotEqual(default.brushes[0]['descriptor']['id'],legacy['descriptor']['id'])
 def test_disabled_timer_and_legacy_alias_are_byte_exact_legacy_and_do_not_enable_time_sensors(self):
  for override in [{},{'PaintOpSettings/isAirbrushing':'false'},{'AirbrushOption/isAirbrushing':'true','AirbrushOption/rate':'1000'}]:
   params={'PressureSize':'true','SizeSensor':'<params id="time" duration="720" periodic="1"/>',**override}
   with self.subTest(override=override),tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);out,raw=self.imported(root,params);legacy=preset(raw,'Own127.kpp',convert.Catalog(root/'legacy'),{});self.assertEqual(out.brushes,[legacy]);self.assertNotIn('timing',out.brushes[0]['descriptor']['behavior'])
 def test_invalid_rate_remains_explicit_unsupported_and_disabled_bad_rate_does_not_activate(self):
  for rate in ['nan','-1','1001']:
   with self.subTest(rate=rate),tempfile.TemporaryDirectory()as tmp:
    out,_=self.imported(Path(tmp),{'PaintOpSettings/isAirbrushing':'true','PaintOpSettings/rate':rate});b=out.brushes[0];self.assertNotIn('timing',b['descriptor']['behavior']);self.assertTrue(any(n['feature']=='airbrush'and n['status']=='unsupported'for n in b['compatibility']))
 def test_private_foreign_bridge_never_inherits_default_root_authority(self):
  params={'PaintOpSettings/isAirbrushing':'true','PressureRotation':'true','RotationSensor':'<params id="fuzzy"/>'};raw=authored(params)
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);a=preset(raw,'Own127.kpp',convert.Catalog(root/'a'),{},_allow_texture_material=False);b=preset(raw,'Own127.kpp',convert.Catalog(root/'b'),{},_allow_texture_material=False,_default_input_policy=DEFAULT_NATIVE_INPUT_POLICY);self.assertEqual(a,b);self.assertNotIn('timing',b['descriptor']['behavior'])
 def test_default_root_does_not_enable_child_time_or_independent_drawing_angle_policy(self):
  params={'PaintOpSettings/isAirbrushing':'true','PaintOpSettings/rate':'20','PressureSize':'true','SizeSensor':'<params id="fuzzy"/>','MaskingBrush/Enabled':'true','MaskingBrush/UseMasterSize':'true','MaskingBrush/MasterSizeCoeff':'1','MaskingBrush/MaskingCompositeOp':'multiply','MaskingBrush/Preset/brush_definition':'<Brush type="auto_brush"><MaskGenerator type="circle" diameter="20"/></Brush>','MaskingBrush/Preset/PressureSize':'true','MaskingBrush/Preset/SizeSensor':'<params id="time" duration="720" periodic="1"/>'}
  with tempfile.TemporaryDirectory()as tmp:
   out,_=self.imported(Path(tmp),params);d=out.brushes[0]['descriptor'];self.assertIn('timing',d['behavior']);child=d['behavior']['dual']['brush'];self.assertNotIn('timing',child['behavior']);self.assertNotIn('strokeInput',child['behavior']);self.assertFalse(any(v.get('control')=='time'for values in child['behavior'].get('modulations',{}).values()for v in values))
 def test_actual_cli_default_entry_used_by_api_captures_timing_without_hidden_flags(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);path=root/'Own127.kpp';raw=authored({'PaintOpSettings/isAirbrushing':'true','PressureSize':'true','SizeSensor':'<params id="fuzzy"/>'});path.write_bytes(raw)
   with patch.object(sys,'argv',['convert.py',str(path),'--output',str(root/'cli')]):convert.main()
   d=json.loads((root/'cli/manifest.json').read_text())['brushes'][0]['descriptor'];self.assertIn('timing',d['behavior']);self.assertGreaterEqual(d['version'],81);self.identity(d,raw)
 def test_stock_path_uses_same_default_entry_and_explicit_false_stays_false(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);path=root/'Own127.kpp';path.write_bytes(authored({'PaintOpSettings/isAirbrushing':'true','PressureSize':'true','SizeSensor':'<params id="fuzzy"/>'}));lock={'schemaVersion':1,'sourceCommit':'authored','kritaVersion':'authored','files':[{'path':'Own127.kpp','group':'default'}]}
   for label,flags,expected in [('default',{},True),('legacy',{'timed_input':False},False)]:
    with patch('krita_stock.verified_source',return_value=path):krita_stock.build(lock,root,root/label,**flags)
    d=json.loads((root/label/'manifest.json').read_text())['brushes'][0]['descriptor'];self.assertEqual('timing'in d['behavior'],expected)
 def test_bad_policy_flags_reject_before_output(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);path=root/'Own127.kpp';path.write_bytes(authored({}));out=convert.Catalog(root/'out')
   for timed in [0,1,'true',{}]:
    with self.assertRaises(ValueError):convert_krita(path,out,timed_input=timed)
   self.assertEqual(out.brushes,[]);self.assertEqual(out.assets,{})

 def test_color_smudge_fuzzy_timer_remains_unclaimed_and_legacy_unchanged(self):
  from test_krita import kpp
  params='<param name="PaintOpSettings/isAirbrushing">true</param><param name="PaintOpSettings/rate">20</param><param name="PressureRotation">true</param><param name="RotationUseCurve">true</param><param name="RotationSensor"><![CDATA[<params id="fuzzy"/>]]></param>'
  raw=kpp(engine='colorsmudge',resources=params)
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);path=root/'OwnSmudge127.kpp';path.write_bytes(raw);default=convert.Catalog(root/'default');legacy=convert.Catalog(root/'legacy');convert_krita(path,default);convert_krita(path,legacy,timed_input=False);self.assertEqual(default.brushes,legacy.brushes);self.assertEqual(default.skipped,legacy.skipped);self.assertEqual(len(default.brushes),1);d=default.brushes[0]['descriptor'];self.assertNotIn('timing',d['behavior']);self.assertNotIn('grafettoSourceTime-v1',json.dumps(d))
