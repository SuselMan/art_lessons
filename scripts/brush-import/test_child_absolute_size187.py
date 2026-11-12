"""Own native-format187 KPP and exact independent-channel scope/portable witnesses."""
import base64,copy,io,json,os,tempfile,unittest
from pathlib import Path
from xml.etree import ElementTree as ET
from PIL import Image,PngImagePlugin
import convert
from krita_import import convert_krita
from child_absolute_size187 import independent_child_absolute_size187_scope
from stroke_input import independent_drawing_angle_pair
from test_child_drawing_angle120 import P as OLD120
from test_krita_size_strength import authored as old_authored

PARAMS={**OLD120,'PaintOpAction':'1','CompositeOp':'normal','PressureSize':'false','MaskingBrush/CompositeOp':'multiply','MaskingBrush/Preset/PressureSize':'true','MaskingBrush/Preset/SizeValue':'.5','MaskingBrush/Preset/SizeUseCurve':'true','MaskingBrush/Preset/SizeUseSameCurve':'true','MaskingBrush/Preset/SizecommonCurve':'0,0;1,1;','MaskingBrush/Preset/SizecurveMode':'0','MaskingBrush/Preset/SizeSensor':'<params id="drawingangle" lockedAngleMode="0" angleOffset="0"/>'}
def genuine187(patch=None):
 params={**PARAMS,**(patch or{})};params.setdefault('brush_definition','<Brush type="auto_brush" spacing=".1"><MaskGenerator type="circle" ratio="1" diameter="4"/></Brush>')
 root=ET.Element('Preset',name='Own187',paintopid='paintbrush',version='5.0')
 for k,v in params.items():
  kind='bool'if v in('true','false')else'double'if k.endswith(('Value','Coeff'))else'int'if k.endswith(('curveMode','PaintOpAction'))else'string'
  ET.SubElement(root,'param',name=k,type=kind).text=v
 meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(root,encoding='unicode'));out=io.BytesIO();Image.new('RGBA',(2,2),(255,255,255,255)).save(out,format='PNG',pnginfo=meta);return out.getvalue()

class ChildAbsoluteSize187Tests(unittest.TestCase):
 def imported(self,tmp,patch=None):
  p=Path(tmp)/'Own187.kpp';p.write_bytes(genuine187(patch));c=convert.Catalog(Path(tmp)/'native');convert_krita(p,c);return c
 def test_native_unlocked_size_and_pressure_scaling_keep_constant_once(self):
  for sensor in[PARAMS['MaskingBrush/Preset/SizeSensor'],'<params id="sensorslist"><ChildSensor id="drawingangle" lockedAngleMode="0" angleOffset="0"/><ChildSensor id="pressure"/></params>']:
   with self.subTest(sensor=sensor),tempfile.TemporaryDirectory()as tmp:
    c=self.imported(tmp,{'MaskingBrush/Preset/SizeSensor':sensor});self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];child=d['behavior']['dual']['brush'];self.assertEqual((d['version'],child['version']),(187,187));self.assertTrue(independent_child_absolute_size187_scope(d));self.assertTrue(independent_drawing_angle_pair(d));self.assertEqual(child['sizeByPressure'],[[0,.5],[1,.5]]);expr=child['behavior']['modulations']['size'][0]['combine'];self.assertEqual(expr['constant'],.5);self.assertEqual(expr['absolute']['curve'],[[0,0],[1,1]]);self.assertIs(expr['absolute']['locked'],False)
    if os.environ.get('DURABLE187_FIXTURE')and sensor==PARAMS['MaskingBrush/Preset/SizeSensor']:
     target=Path(os.environ['DURABLE187_FIXTURE']);target.mkdir(exist_ok=True);(target/'Own187.kpp').write_bytes(genuine187());(target/'native-library.json').write_text(json.dumps(c.write(),ensure_ascii=False,indent=2))
 def test_portable_whole_records_and_new_scope_negatives_before_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=self.imported(tmp);lib=c.write();env={'library':lib,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in lib['assets']}};p=Path(tmp)/'Own.grafetto-brushes.json';p.write_text(json.dumps(env));o=convert.Catalog(Path(tmp)/'positive');convert.portable_bundle(p,o);self.assertEqual(o.brushes,c.brushes)
   def child(d):return d['behavior']['dual']['brush']
   changes=[*[lambda d,p=p:child(d)['behavior']['modulations']['size'][0].update(p)for p in[{'randomSource':'stroke'},{'jitter':.1},{'control':'random'},{'control':'time'},{'minimum':.1},{'unexpected':True}]],lambda d:d.update(version=186),lambda d:child(d).update(version=186),lambda d:child(d)['behavior']['modulations']['size'][0]['combine']['absolute'].update(locked=True),lambda d:d['behavior']['strokeInput'].update(fanCorners={'stepDegrees':30}),lambda d:child(d)['behavior']['modulations']['size'][0]['combine']['absolute'].update(curve=[[0,0],[.5,.5],[1,1]]),lambda d:child(d)['behavior']['modulations']['size'][0].update(control=['off']),lambda d:child(d)['behavior']['modulations']['size'][0]['combine'].update(mode=['product'])]
   for i,change in enumerate(changes):
    bad=copy.deepcopy(env);change(bad['library']['brushes'][0]['descriptor']);p.write_text(json.dumps(bad));o=convert.Catalog(Path(tmp)/('negative'+str(i)))
    with self.assertRaises(ValueError):convert.portable_bundle(p,o)
    self.assertEqual(list(o.output.iterdir()),[])
 def test_native_locked_other_target_airbrush_and_foreign_parent_stay_declined(self):
  for patch in[{'MaskingBrush/Preset/SizeSensor':'<params id="drawingangle" lockedAngleMode="1"/>'},{'PressureRotation':'false'},{'MaskingBrush/Preset/PaintOpSettings/isAirbrushing':'true'},{'MaskingBrush/Preset/PressureSize':'false','MaskingBrush/Preset/PressureOpacity':'true','MaskingBrush/Preset/OpacitySensor':'<params id="drawingangle"/>'}]:
   with self.subTest(patch=patch),tempfile.TemporaryDirectory()as tmp:self.assertTrue(self.imported(tmp,patch).skipped)
 def test_old120_whole_record_identity_is_unchanged(self):
  expected=json.loads(Path(os.environ['OLD120_BASELINE']).read_text())
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/'Own.kpp';p.write_bytes(old_authored(OLD120));c=convert.Catalog(Path(tmp)/'native');convert_krita(p,c);self.assertEqual(c.skipped,[]);self.assertEqual(c.write(),expected)

 def test_malformed_marker_containers_do_not_raise_attribute_error(self):
  for value in[{'version':187,'behavior':[]},{'version':187,'behavior':{'dual':[]}}, {'version':120,'behavior':{'dual':{'brush':[]}}}]:
   self.assertFalse(independent_drawing_angle_pair(value))
