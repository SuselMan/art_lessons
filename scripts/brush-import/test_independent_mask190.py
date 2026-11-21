"""One coherent native Mask190 group: seven UI responses/resources/whole roles."""
import base64,copy,io,json,os,tempfile,unittest
from pathlib import Path
from xml.etree import ElementTree as ET
from PIL import Image,PngImagePlugin
import convert
from krita_import import convert_krita
from independent_mask190 import independent_mask190_scope,validate_independent_mask190
from test_krita_size_strength import authored
from test_child_drawing_angle120 import P

AUTO='<Brush type="auto_brush" spacing=".1"><MaskGenerator type="rect" ratio=".5" diameter="16" id="default" hfade=".5" vfade=".8" antialiasEdges="1"/></Brush>'
COMBO='<params id="sensorslist"><ChildSensor id="pressurein"/><ChildSensor id="perspective"/><ChildSensor id="rotation"/><ChildSensor id="tangentialpressure"/></params>'
PARAMS={**P,'PaintOpAction':'1','MaskingBrush/UseMasterSize':'false','MaskingBrush/Preset/brush_definition':AUTO,'MaskingBrush/Preset/PressureRotation':'true','MaskingBrush/Preset/RotationSensor':'<params id="drawingangle" lockedAngleMode="0" fanCornersEnabled="1" fanCornersStep="30"/>','MaskingBrush/Preset/PressureSize':'true','MaskingBrush/Preset/SizeSensor':COMBO,'MaskingBrush/Preset/SizeValue':'.5','MaskingBrush/Preset/PressureOpacity':'true','MaskingBrush/Preset/OpacitySensor':COMBO,'MaskingBrush/Preset/PressureFlow':'true','MaskingBrush/Preset/FlowSensor':COMBO,'MaskingBrush/Preset/PressureRatio':'true','MaskingBrush/Preset/RatioSensor':COMBO,'MaskingBrush/Preset/PressureMirror':'true','MaskingBrush/Preset/HorizontalMirrorEnabled':'true','MaskingBrush/Preset/MirrorSensor':COMBO,'MaskingBrush/Preset/PressureScatter':'true','MaskingBrush/Preset/ScatterSensor':COMBO,'MaskingBrush/Preset/ScatterValue':'.2'}
def native(tmp,patch=None,external=None):
    params={**PARAMS,**(patch or{})};raw=authored(params);path=Path(tmp)/'Own190.kpp';path.write_bytes(raw);c=convert.Catalog(Path(tmp)/'native');convert_krita(path,c,external);return raw,c
class IndependentMask190Tests(unittest.TestCase):
 def test_perspective_without_assistant_is_not_private_mask_authority(self):
  from independent_mask190 import uses_native_mask190_controls,validate_independent_mask190
  root={'version':58,'behavior':{'modulations':{'size':[{'control':'perspective','minimum':0,'jitter':0,'curve':[[0,0],[1,1]]}]}}}
  self.assertFalse(uses_native_mask190_controls(root['behavior']));self.assertFalse(validate_independent_mask190(root))
  root['behavior']['modulations']['size'][0]['control']='pressureIn'
  with self.assertRaises(ValueError):validate_independent_mask190(root)
 def test_antialiased_radial_curve_for_each_native_component(self):
  curve='<Brush type="auto_brush" spacing=".1"><MaskGenerator type="circle" ratio=".5" diameter="16" id="soft" hfade=".4" vfade=".4" spikes="2" antialiasEdges="1" softness_curve="0,1;1,0;"/></Brush>'
  for key in ('brush_definition','MaskingBrush/Preset/brush_definition'):
   with self.subTest(key=key),tempfile.TemporaryDirectory() as tmp:
    raw,c=native(tmp,{key:curve});self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertTrue(independent_mask190_scope(d))
    tip=(d if key=='brush_definition' else d['behavior']['dual']['brush'])['tip'];self.assertEqual(tip['profile']['kind'],'radialCurve');self.assertTrue(tip['profile']['antialias'])
    env={'library':c.write(),'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}}
    path=Path(tmp)/'portable.grafetto-brushes.json';path.write_text(json.dumps(env));out=convert.Catalog(Path(tmp)/'portable');convert.portable_bundle(path,out);self.assertEqual(out.brushes,c.brushes)
 def test_component_bridge_keeps_bytearray_types(self):
  from unittest.mock import patch
  from native_mask190 import lower_pair,png_preset
  from krita_import import _preset_impl
  raw=authored({**PARAMS,'MaskingBrush/Preset/Texture/Pattern/Pattern':base64.b64encode(b'YQ==').decode()})
  image=Image.open(io.BytesIO(raw));root=ET.fromstring(image.info['preset'])
  for param in root.findall('param'):
   if param.get('name')=='MaskingBrush/Preset/Texture/Pattern/Pattern':param.set('type','bytearray')
  encoded=png_preset(root);seen=[]
  def inspect(node):
   for param in node.findall('param'):
    if param.get('name')=='Texture/Pattern/Pattern':seen.append(param.get('type'))
   return png_preset(node)
  with tempfile.TemporaryDirectory() as tmp,patch('native_mask190.png_preset',side_effect=inspect):
   c=convert.Catalog(Path(tmp)/'native')
   lower_pair(encoded,'test.kpp',c,{},_preset_impl,dict(sequential_xy=False,stroke_input=False,timed_input=False,_allow_texture_material=True,_default_input_policy=None,_native_sampling_candidate=None,_primary_clock_read=False,_bristle_source_capture=None))
  self.assertEqual(seen,['bytearray'])
 def test_seven_options_native_size_source_fan_and_portable_whole(self):
  with tempfile.TemporaryDirectory()as tmp:
   raw,c=native(tmp);self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertTrue(independent_mask190_scope(d));child=d['behavior']['dual']['brush'];self.assertEqual(d['version'],190);self.assertEqual(child['version'],190);self.assertEqual(d['behavior']['dual']['sizePolicy'],{'kind':'resource','diameter':16});self.assertEqual(child['behavior']['strokeInput']['fanCorners'],{'stepDegrees':30});self.assertIn('scatter',child)
   for target in('size','opacity','flow','roundness','scatter'):self.assertIn(target,child['behavior']['modulations'])
   self.assertIn('dynamics',child['behavior']['mirror']);expr=child['behavior']['modulations']['size'][0]['combine'];self.assertEqual(expr['constant'],.5);self.assertEqual([x['control']for x in expr['scaling']],['pressureIn','perspective','tangentialPressure']);self.assertEqual(expr['additive'][0]['control'],'barrelRotation')
   lib=c.write();env={'library':lib,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in lib['assets']}};p=Path(tmp)/'own.grafetto-brushes.json';p.write_text(json.dumps(env));o=convert.Catalog(Path(tmp)/'portable');convert.portable_bundle(p,o);self.assertEqual(o.brushes,c.brushes)
   if os.environ.get('DURABLE190'):
    target=Path(os.environ['DURABLE190']);target.mkdir(exist_ok=True);(target/'Own190.kpp').write_bytes(raw);(target/'library.json').write_text(json.dumps(lib,indent=2));(target/'portable.json').write_text(json.dumps(env,indent=2))
 def test_ten_modes_same_assembled_scope_and_strict_orphans(self):
  from independent_mask190 import MODES
  for native_mode,canonical in MODES.items():
   with self.subTest(mode=native_mode),tempfile.TemporaryDirectory()as tmp:
    _,c=native(tmp,{'MaskingBrush/MaskingCompositeOp':native_mode});self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['behavior']['dual']['blendMode'],canonical);self.assertTrue(independent_mask190_scope(d))
    with self.assertRaises(ValueError):validate_independent_mask190(d['behavior']['dual']['brush'])
    for mutate in[lambda x:x.update(model='mixer'),lambda x:x['behavior']['dual']['brush'].update(filter={'kind':'invert'}),lambda x:x['behavior']['dual'].update(sizePolicy={'kind':'resource','diameter':float('nan')})]:
     bad=copy.deepcopy(d);mutate(bad);self.assertFalse(independent_mask190_scope(bad))
 def test_text_pipe_retains_repeated_UTF16_positions_and_font_warning(self):
  text='<Brush type="kis_text_brush" spacing=".2" text="ABA" font="Arial,12,-1,5,50,0,0,0,0,0" pipe="true"/>'
  with tempfile.TemporaryDirectory()as tmp:
   _,c=native(tmp,{'MaskingBrush/Preset/brush_definition':text});self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];child=d['behavior']['dual']['brush'];a=child['tip']['animation'];self.assertEqual(a['mode'],'incremental');self.assertEqual(len(a['frames']),3);self.assertEqual(a['frames'][0],a['frames'][2]);self.assertNotEqual(a['frames'][0],a['frames'][1]);self.assertTrue(any('substituted' in w for w in c.brushes[0]['warnings']))
 def test_active_non_UI_flags_declined_instead_of_stripped(self):
  for patch in[{'MaskingBrush/Preset/PressureHue':'true'},{'MaskingBrush/Preset/PaintOpSettings/isAirbrushing':'true'},{'MaskingBrush/Preset/MaskingBrush/Enabled':'true'},{'MaskingBrush/MaskingCompositeOp':'invented'}]:
   with self.subTest(patch=patch),tempfile.TemporaryDirectory()as tmp:
    _,c=native(tmp,patch);self.assertTrue(c.skipped);self.assertEqual(c.brushes,[])
 def test_all_flat_selectors_and_original_colored_frame_geometry(self):
  from test_krita_variable_gih import frame,pipe
  rawframes=[frame(2,2,bytes([20,70,180,128])*4,4),frame(3,2,bytes([230,40,10,255])*6,4)]
  for mode in('constant','pressure','velocity','angular','xtilt','ytilt','random','incremental'):
   with self.subTest(mode=mode),tempfile.TemporaryDirectory()as tmp:
    patch={'MaskingBrush/Preset/brush_definition':'<Brush type="gbr_brush" filename="own.gih" brushApplication="1" scale="1" spacing=".2"/>'}
    _,c=native(tmp,patch,{'own.gih':pipe(rawframes,mode)});self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];child=d['behavior']['dual']['brush'];self.assertEqual(child['tip']['animation']['mode'],mode);self.assertIn('color',child['tip']);self.assertEqual(child['tip']['animation']['geometry']['frames'][1]['sourceWidth'],3)
    lib=c.write()
    if os.environ.get('DURABLE190'):
     target=Path(os.environ['DURABLE190'])/'pipes';target.mkdir(exist_ok=True);(target/(mode+'.json')).write_text(json.dumps(lib,indent=2))
     for a in lib['assets']:(target/a['file']).write_bytes((c.output/a['file']).read_bytes())
    env={'library':lib,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in lib['assets']}};path=Path(tmp)/'check.grafetto-brushes.json';path.write_text(json.dumps(env));out=convert.Catalog(Path(tmp)/'portable');convert.portable_bundle(path,out);self.assertEqual(out.brushes,c.brushes)
 def test_text_overlay_does_not_eagerly_read_unrelated_resource(self):
  from collections.abc import Mapping
  from native_mask190 import lower_pair
  from krita_import import _preset_impl
  class Lazy(Mapping):
   def __iter__(self):return iter(['unrelated.png'])
   def __len__(self):return 1
   def __getitem__(self,key):raise AssertionError('Unrelated lazy payload read')
  with tempfile.TemporaryDirectory()as tmp:
   raw=authored(PARAMS);c=convert.Catalog(Path(tmp)/'lazy');result=lower_pair(raw,'Own190.kpp',c,Lazy(),_preset_impl,dict(sequential_xy=False,stroke_input=False,timed_input=False,_allow_texture_material=True,_default_input_policy=None,_native_sampling_candidate=None,_primary_clock_read=False,_bristle_source_capture=None));self.assertTrue(independent_mask190_scope(result['descriptor']))
 def test_forged_primitive_values_reject_before_asset_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   _,c=native(tmp);lib=c.write();base={'library':lib,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in lib['assets']}}
   edits=[lambda d:d['behavior']['rendering'].update(mode='bogus'),lambda d:d['behavior']['rendering'].update(blendMode='bogus'),lambda d:d['behavior']['rendering'].update(accumulation='bogus'),lambda d:d['behavior']['dual']['brush']['behavior']['mirror'].update(horizontal=1),lambda d:d['behavior']['spacing'].update(coefficient=-1),lambda d:d.update(flowSpan=0),lambda d:d['behavior']['dual']['brush']['scatter'].update(radius=float('nan')),lambda d:d['behavior']['rotation'].update(follow='1'),lambda d:d['behavior'].update(speedInput={'version':1,'space':'canvas','maximum':30,'estimator':'grafettoEMA30ms'})]
   for i,edit in enumerate(edits):
    value=copy.deepcopy(base);edit(value['library']['brushes'][0]['descriptor']);path=Path(tmp)/'bad.grafetto-brushes.json';path.write_text(json.dumps(value));out=convert.Catalog(Path(tmp)/('rejected'+str(i)))
    with self.assertRaises(ValueError):convert.portable_bundle(path,out)
    self.assertEqual(list(out.output.iterdir()),[])
 def test_missing_font_resolver_keeps_style_and_reports_substitution(self):
  from unittest.mock import patch
  from native_mask190 import text_resource
  from PIL import ImageFont
  definition=ET.fromstring('<Brush type="kis_text_brush" text="A" font="Unavailable Own Font,12,-1,5,75,1,1,1,0,0" pipe="false"/>')
  actual=ImageFont.truetype
  with patch('native_mask190.subprocess.run',side_effect=FileNotFoundError),patch('native_mask190.ImageFont.truetype',wraps=actual)as font:
   _,warning=text_resource(definition,{});self.assertIn('BoldOblique.ttf',font.call_args.args[0]);self.assertIn('substituted',warning)
 @unittest.skipUnless(os.environ.get("OLD187188"), "External immutable187188 fixture requires OLD187188")
 def test_old187188_whole_records_remain_exact(self):
  original=Path(os.environ['OLD187188']);expected=json.loads((original/'Authored187188.grafetto-brushes.json').read_text())['library']
  with tempfile.TemporaryDirectory()as tmp:
   c=convert.Catalog(Path(tmp)/'old');convert_krita(original/'Authored187188.bundle',c);self.assertEqual(c.skipped,[]);self.assertEqual(c.write(),expected)
if __name__=='__main__':unittest.main()
