"""132 captured primary clock: authored artwork with genuine option strings."""
import unittest,tempfile,json,copy,io,base64
from pathlib import Path
from PIL import Image
import convert
from krita_import import convert_krita,preset,DEFAULT_NATIVE_INPUT_POLICY
from child_clock132 import independent_child_clock132_pair
from brush_contract import finalize_identity
from test_krita_size_strength import authored
FIXTURE=json.loads((Path(__file__).parent/'fixtures/child_clock132_round_grunge_controls.json').read_text())
def params132():
 p=copy.deepcopy(FIXTURE['params']);p['brush_definition']='<Brush type="auto_brush" spacing=".1" density="1" randomness="0"><MaskGenerator type="circle" id="default" diameter="16" ratio="1" hfade="1" vfade="1" spikes="2" antialiasEdges="0"/></Brush>';p['MaskingBrush/Preset/brush_definition']='<Brush type="png_brush" filename="own-child.png" spacing=".12" scale="1" ColorAsMask="0"/>';return p
def resources132():
 o=io.BytesIO();Image.frombytes('L',(4,4),bytes([0,255,255,255,0,0,255,255,0,255,255,255,0,0,0,0])).save(o,format='PNG');return{'own-child.png':o.getvalue()}
class ChildClock132(unittest.TestCase):
 def imported(self,tmp,patch=None,**options):
  params=params132();params.update(patch or{});raw=authored(params);path=Path(tmp)/'Own132.kpp';path.write_bytes(raw);catalog=convert.Catalog(Path(tmp)/'native');convert_krita(path,catalog,resources132(),**options);self.assertEqual(catalog.skipped,[]);return catalog,raw
 def test_default_API_preserves_active_time_fuzzy_pressure_child_and_subtract_Wash(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,raw=self.imported(tmp);d=c.brushes[0]['descriptor'];child=d['behavior']['dual']['brush'];self.assertEqual((d['version'],child['version']),(132,132));self.assertTrue(independent_child_clock132_pair(d));self.assertEqual(child['behavior']['clockRead'],{'version':1,'source':'primary'});self.assertNotIn('timing',child['behavior']);self.assertEqual(d['behavior']['dual']['blendMode'],'subtract');self.assertEqual(d['behavior']['rendering']['accumulation'],'alphaDarken');self.assertIn('scatter',child);time=next(c for c in child['behavior']['modulations']['size']if c['control']=='time');self.assertEqual((time['period'],time['periodic']),(6340,True));self.assertEqual(time['curve']['samples'][0],1);self.assertIn('rotation',child['behavior']);self.assertFalse(any(n['status']=='unsupported'and n['feature']=='masking.SizeSensor'and 'sensor time'in n['detail']for n in c.brushes[0]['compatibility']));self.assertEqual(finalize_identity(copy.deepcopy(d),raw)['id'],d['id']);self.assertFalse(any('masking.SizeSensor: Unsupported Krita sensor time'in w for w in c.brushes[0]['warnings']))
 def test_explicit_legacy_false_and_private_origin_do_not_gain_clock_read(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.imported(tmp,timed_input=False);d=c.brushes[0]['descriptor'];self.assertNotIn('clockRead',d['behavior']['dual']['brush']['behavior']);self.assertTrue(any(n['status']=='unsupported'and n['feature']=='masking.SizeSensor'for n in c.brushes[0]['compatibility']))
  with tempfile.TemporaryDirectory()as tmp:
   c=convert.Catalog(Path(tmp)/'private');d=preset(authored(params132()),'private.kpp',c,resources132(),_allow_texture_material=False,_default_input_policy=DEFAULT_NATIVE_INPUT_POLICY)['descriptor'];self.assertNotIn('clockRead',d['behavior']['dual']['brush']['behavior'])
 def test_native_clock_scope_excludes_child_timer_and_ineligible_primary(self):
  for patch in[{'PaintOpSettings/isAirbrushing':'false'},{'MaskingBrush/Preset/PaintOpSettings/isAirbrushing':'true'},{'MaskingBrush/Preset/PressureSize':'false'},{'MaskingBrush/Preset/SizeUseCurve':'false'},{'MaskingBrush/MaskingCompositeOp':'overlay'}]:
   with self.subTest(patch=patch),tempfile.TemporaryDirectory()as tmp:
    c,_=self.imported(tmp,patch);self.assertNotIn('clockRead',c.brushes[0]['descriptor']['behavior']['dual']['brush']['behavior'])
 def test_portable_parent_proof_and_marker_closed_before_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.imported(tmp);env={'library':c.write(),'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}};path=Path(tmp)/'Own.grafetto-brushes.json';path.write_text(json.dumps(env));good=convert.Catalog(Path(tmp)/'good');convert.portable_bundle(path,good);self.assertEqual(good.brushes,c.brushes)
   for case in['root131','child131','markerMissing','timer','childTimer','inline','marker','standalone','material','animation','erase','misplacedTime']:
    e=copy.deepcopy(env);d=e['library']['brushes'][0]['descriptor'];child=d['behavior']['dual']['brush']
    if case=='root131':d['version']=131
    elif case=='child131':child['version']=131
    elif case=='markerMissing':child['behavior'].pop('clockRead')
    elif case=='timer':d['behavior'].pop('timing')
    elif case=='childTimer':child['behavior']['timing']=copy.deepcopy(d['behavior']['timing'])
    elif case=='inline':d['behavior']['dual']['sampling']='inline'
    elif case=='marker':child['behavior']['clockRead']['source']='receiver'
    elif case=='standalone':e['library']['brushes'][0]['descriptor']=child
    elif case=='material':child['tip']['material']={'kind':'lightness','gray':child['tip']['mask'],'strength':1}
    elif case=='animation':child['tip']['animation']={'mode':'random','frames':[child['tip']['mask']]*2}
    elif case=='erase':d['behavior']['erase']=True
    else:child['behavior']['modulations']['opacity']=child['behavior']['modulations'].pop('size')
    path.write_text(json.dumps(e));bad=convert.Catalog(Path(tmp)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):convert.portable_bundle(path,bad)
    self.assertEqual(list(bad.output.iterdir()),[])

 def test_internal_primary_clock_permission_requires_actual_boolean_before_parsing(self):
  for flag in(0,1,'true',None,{},[]):
   with self.subTest(flag=flag),self.assertRaisesRegex(ValueError,'Private primary clock read must be boolean'):
    preset(b'', 'invalid.kpp', None, {}, _primary_clock_read=flag)
 def test_internal_clock_boolean_values_accept_valid_kpp(self):
  from test_krita import kpp
  raw=kpp()
  with tempfile.TemporaryDirectory() as tmp:
   for flag in (False,True):
    with self.subTest(flag=flag):
     result=preset(raw,'good.kpp',convert.Catalog(Path(tmp)/str(flag)),{},_primary_clock_read=flag)
     self.assertEqual(result['descriptor']['version'],27)
 def test_invalid_clock_flag_keeps_existing_source_scope(self):
  from krita_import import _SOURCE_SCOPE
  token=_SOURCE_SCOPE.set(('spraybrush','1'))
  try:
   with self.assertRaisesRegex(ValueError,'Private primary clock read must be boolean'):
    preset(b'', 'invalid.kpp', None, {}, _primary_clock_read=1, _adapter_private=True)
   self.assertEqual(_SOURCE_SCOPE.get(),('spraybrush','1'))
  finally:_SOURCE_SCOPE.reset(token)
 def test_public_invalid_kpp_does_not_poison_next_bundle_entry(self):
  import zipfile
  from test_krita import kpp
  from krita_import import _SOURCE_SCOPE
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);bad=root/'bad.kpp';bad.write_bytes(b'')
   single=convert.Catalog(root/'single');convert_krita(bad,single)
   self.assertFalse(single.brushes);self.assertFalse(single.assets);self.assertEqual(len(single.skipped),1)
   bundle=root/'pair.bundle'
   with zipfile.ZipFile(bundle,'w') as archive:
    archive.writestr('bad.kpp',b'');archive.writestr('good.kpp',kpp())
   output=convert.Catalog(root/'bundle');convert_krita(bundle,output)
   self.assertEqual(len(output.skipped),1);self.assertEqual(len(output.brushes),1)
   self.assertIsNone(_SOURCE_SCOPE.get())
 def test_invalid_child_Time_period_retains_baseline_warning_without_fake132_or_hard_rejection(self):
  for duration in('0','2147483648','not-an-int'):
   with self.subTest(duration=duration),tempfile.TemporaryDirectory()as tmp:
    c,_=self.imported(tmp,{'MaskingBrush/Preset/SizeSensor':'<params id="sensorslist"><ChildSensor id="fuzzy"/><ChildSensor id="time" duration="'+duration+'" periodic="1"/><ChildSensor id="pressure"/></params>'})
    d=c.brushes[0]['descriptor'];self.assertNotIn('clockRead',d['behavior']['dual']['brush']['behavior']);self.assertFalse(independent_child_clock132_pair(d));self.assertTrue(any(n['feature']=='masking.SizeSensor'and n['status']=='unsupported'and 'sensor time'in n['detail']for n in c.brushes[0]['compatibility']))
