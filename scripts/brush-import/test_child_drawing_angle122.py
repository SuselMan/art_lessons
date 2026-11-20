import base64,copy,json,tempfile,unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from stroke_input import validate_policy,independent_drawing_angle_pair
from test_krita_size_strength import authored
from test_krita_variable_gih import frame
P={'PressureRotation':'true','RotationUseCurve':'true','RotationValue':'1','RotationSensor':'<params id="drawingangle"/>','MaskingBrush/Enabled':'true','MaskingBrush/Preset/brush_definition':'<Brush type="gbr_brush" filename="child.gbr" scale="1"/>','MaskingBrush/Preset/PressureRotation':'true','MaskingBrush/Preset/RotationUseCurve':'true','MaskingBrush/Preset/RotationValue':'1','MaskingBrush/Preset/RotationSensor':'<params id="drawingangle"/>'}
POLICY={'version':1,'initialDirection':'cursorHistory'}
class ChildDrawingAngle122(unittest.TestCase):
 def imported(self,tmp,patch=None):
  p=Path(tmp)/'Own.kpp';p.write_bytes(authored({**P,**(patch or{})}));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'child.gbr':frame(4,2,[255,0,0,0,128,0,0,0])});self.assertEqual(c.skipped,[]);return c
 def test_genuine_default_API_pair_uses_existing_alphaDarken_and_captured_parent(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=self.imported(tmp);d=c.brushes[0]['descriptor'];child=d['behavior']['dual']['brush'];self.assertEqual(d['version'],122);self.assertEqual(child['version'],122);self.assertTrue(independent_drawing_angle_pair(d));self.assertEqual(d['behavior']['strokeInput'],POLICY);self.assertEqual(child['behavior']['strokeInput'],POLICY);self.assertEqual(child['behavior']['rendering']['accumulation'],'alphaDarken');self.assertEqual(d['behavior']['rendering']['accumulation'],'directOver');validate_policy(child,1,d)
   with self.assertRaises(ValueError):validate_policy(child,1,None)
 def test_portable_parentproof_precedes_all_asset_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=self.imported(tmp);data={'library':c.write(),'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}};p=Path(tmp)/'Own.grafetto-brushes.json';p.write_text(json.dumps(data));o=convert.Catalog(Path(tmp)/'ok');convert.portable_bundle(p,o);self.assertEqual(o.brushes,c.brushes)
   edits=[lambda d:d.update(version=121),lambda d:d['behavior'].pop('strokeInput'),lambda d:d['behavior']['dual'].update(sampling='inline'),lambda d:d['behavior']['dual']['brush'].update(version=121),lambda d:d['behavior']['dual']['brush']['behavior']['strokeInput'].update(fanCorners={'stepDegrees':30}),lambda d:d['behavior']['strokeInput'].update(fanCorners={'stepDegrees':30}),lambda d:d['behavior']['dual']['brush']['behavior']['rotation'].update(follow=.5),lambda d:d['behavior']['dual']['brush']['behavior']['rotation'].update(follow=True),lambda d:d['behavior']['dual']['brush']['tip'].update(animation={'mode':'incremental','frames':[d['behavior']['dual']['brush']['tip'].get('mask','asset:'+'0'*64)]*2})]
   for i,edit in enumerate(edits):
    bad=copy.deepcopy(data);edit(bad['library']['brushes'][0]['descriptor']);p.write_text(json.dumps(bad));o=convert.Catalog(Path(tmp)/('bad'+str(i)))
    with (self.assertRaisesRegex(ValueError,'Independent DrawingAngle requires matching120') if i==8 else self.assertRaises(ValueError)):convert.portable_bundle(p,o)
    self.assertEqual(list(o.output.iterdir()),[])
 def test_child_only_fan_and_incompatible_scope_never_fake122(self):
  for patch in[{'PressureRotation':'false'},{'MaskingBrush/Preset/RotationSensor':'<params id="drawingangle" fanCornersEnabled="1" fanCornersStep="30"/>'},{'PressureScatter':'true','ScatterValue':'.2'}]:
   with self.subTest(patch=patch),tempfile.TemporaryDirectory()as tmp:
    c=self.imported(tmp,patch);d=c.brushes[0]['descriptor'];self.assertNotIn('strokeInput',d['behavior']['dual']['brush']['behavior']);self.assertFalse(independent_drawing_angle_pair(d));self.assertLess(d['version'],122)

 def test_old120_procedural_pair_and_literal_bitmap_source_are_distinct(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=self.imported(tmp);d=c.brushes[0]['descriptor'];tip=d['behavior']['dual']['brush']['tip'];self.assertEqual(tip['imageSampling'],{'kind':'integer-pyramid','signal':'inverse-gray','sourceRect':{'x':0,'y':1,'width':4,'height':2}})
   raw=(c.output/c.assets[tip['mask']]['file']).read_bytes();self.assertEqual(raw,bytes([0]*4+[255,0,0,0,128,0,0,0]+[0]*4))
  with tempfile.TemporaryDirectory()as tmp:
   c=self.imported(tmp,{'MaskingBrush/Preset/brush_definition':'<Brush type="auto_brush" spacing=".1"><MaskGenerator type="circle" ratio=".5" diameter="4"/></Brush>'});self.assertEqual(c.brushes[0]['descriptor']['version'],120)
 def test_original_child_png_and_root_bytes_bind_final_identity(self):
  import hashlib,io,xml.etree.ElementTree as ET
  from PIL import Image,PngImagePlugin
  with tempfile.TemporaryDirectory()as tmp:
   c=self.imported(tmp);d=c.brushes[0]['descriptor'];child=d['behavior']['dual']['brush'];node=ET.Element('Preset',{'paintopid':'paintbrush','name':'Masking component'})
   for key,value in P.items():
    if key.startswith('MaskingBrush/Preset/'):ET.SubElement(node,'param',{'name':key[len('MaskingBrush/Preset/'):]}).text=value
   meta=PngImagePlugin.PngInfo();meta.add_text('version','5.0');meta.add_text('preset',ET.tostring(node,encoding='unicode'),zip=True);o=io.BytesIO();Image.new('L',(1,1)).save(o,format='PNG',pnginfo=meta)
   for descriptor,original in[(d,(Path(tmp)/'Own.kpp').read_bytes()),(child,o.getvalue())]:
    seed={'schemaVersion':1,'importerRenderingVersion':3,'sourceSettingsSha256':hashlib.sha256(original).hexdigest(),'rendering':{k:v for k,v in descriptor.items()if k!='id'}}
    expected='imported-'+hashlib.sha256(json.dumps(seed,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()[:24];self.assertEqual(descriptor['id'],expected)
