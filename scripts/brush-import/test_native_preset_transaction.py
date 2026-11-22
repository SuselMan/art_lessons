"""Real authored mixed native bundles, not common-parser mocks."""
from pathlib import Path
import copy,io,json,struct,tempfile,unittest,zipfile
from unittest.mock import patch
from PIL import Image
from brush_contract import Catalog
from krita_import import convert_krita,preset
from test_krita import kpp

def gbr(pixels):
 name=b'rollback107\0'
 return struct.pack('>7I',28+len(name),2,4,4,1,0x47494d50,25)+name+bytes(pixels)
A=gbr([255,255,0,0,255,128,0,0,0,0,64,0,0,0,255,255])
B=gbr([255,0,255,0,0,255,0,255,255,0,255,0,0,255,0,255])
RESOURCES={'shared.gbr':A,'failed.gbr':B}
def definition(name):return '<Brush type="gbr_brush" filename="'+name+'" scale="1" angle="0" ColorAsMask="1"/>'
def accepted():return kpp(definition('shared.gbr'))
def failed_sketch():return kpp(definition('failed.gbr'),engine='sketchbrush',resources='<param name="PressureRotation">true</param><param name="RotationUseCurve">true</param><param name="RotationSensor">malformed ACTIVE XML</param>')
def failed_nested():
 params={'MaskingBrush/Enabled':'true','MaskingBrush/Preset/brush_definition':definition('failed.gbr'),'MaskingBrush/Preset/PressureRotation':'true','MaskingBrush/Preset/RotationUseCurve':'true','MaskingBrush/Preset/RotationSensor':'malformed ACTIVE XML'}
 return kpp(definition('failed.gbr'),resources=''.join('<param name="'+key+'"><![CDATA['+value+']]></param>'for key,value in params.items()))
def bundle(path):
 with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED)as z:
  for name,data in [('paintoppresets/a-accepted.kpp',accepted()),('paintoppresets/b-rejected.kpp',failed_sketch()),('paintoppresets/c-nested.kpp',failed_nested()),('paintoppresets/d-valid.myb',json.dumps({'version':3,'settings':{}}).encode()),('paintoppresets/e-rejected.myb',json.dumps({'version':3,'settings':{'not_a_mypaint_setting':{}}}).encode()),('brushes/shared.gbr',A),('brushes/failed.gbr',B)]:z.writestr(name,data)
class NativePresetRollbackTests(unittest.TestCase):
 def test_mixed_bundle_rolls_back_failed_newcas_preserves_accepted_sharedcas_and_continues_myb(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);control=Catalog(root/'control');expected=preset(accepted(),'a-accepted.kpp',control,RESOURCES);shared=copy.deepcopy(control.assets);raw={k:(control.output/v['file']).read_bytes()for k,v in shared.items()}
   path=root/'fixture.bundle';bundle(path);catalog=Catalog(root/'output');keep=catalog.output/'operator-owned.txt';keep.write_text('do not delete')
   created=[];asset=catalog.asset
   def track(*args,**kwargs):
    key=asset(*args,**kwargs);created.append((key,catalog.assets[key]['file']));return key
   with patch.object(catalog,'asset',side_effect=track):convert_krita(path,catalog)
   new=[(key,name)for key,name in created if key not in shared];self.assertTrue(new);manifest=catalog.write()
   self.assertEqual(len(catalog.brushes),2);self.assertEqual([b['source']for b in catalog.brushes],['a-accepted.kpp','d-valid.myb']);self.assertEqual(catalog.brushes[0],expected);self.assertEqual(len(catalog.skipped),3);self.assertEqual(catalog.assets,shared)
   for key,asset in shared.items():self.assertEqual((catalog.output/asset['file']).read_bytes(),raw[key])
   for key,name in new:self.assertNotIn(key,catalog.assets);self.assertFalse((catalog.output/name).exists())
   self.assertEqual(keep.read_text(),'do not delete');self.assertEqual(manifest['assets'],list(shared.values()))
 def test_individual_kpp_reject_does_not_publish_cas_or_remove_preexisting_unregistered_files(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);path=root/'bad.kpp';path.write_bytes(failed_nested());catalog=Catalog(root/'output');prior=catalog.output/('a'*64+'.bin');prior.write_bytes(b'operator-owned');keep=catalog.output/'keep.txt';keep.write_text('keep')
   created=[];asset=catalog.asset
   def track(*args,**kwargs):
    key=asset(*args,**kwargs);created.append((key,catalog.assets[key]['file']));return key
   with patch.object(catalog,'asset',side_effect=track):convert_krita(path,catalog,RESOURCES)
   self.assertTrue(created);self.assertEqual(catalog.assets,{});self.assertEqual(catalog.brushes,[]);self.assertEqual(len(catalog.skipped),1);self.assertIn('syntax error',catalog.skipped[0]['reasons'][0]);self.assertEqual(prior.read_bytes(),b'operator-owned');self.assertEqual(keep.read_text(),'keep')
   for _,name in created:self.assertFalse((catalog.output/name).exists())
 def test_cleanup_failure_aborts_whole_conversion_rather_than_publishing_orphan_manifest(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);path=root/'bad.kpp';path.write_bytes(failed_nested());catalog=Catalog(root/'output');real=Path.unlink;denied_paths=[]
   def denied(p,*args,**kwargs):
    if p.parent==catalog.output and p.suffix=='.bin':denied_paths.append(p);raise PermissionError('injected rollback failure')
    return real(p,*args,**kwargs)
   with patch.object(Path,'unlink',denied),self.assertRaisesRegex(RuntimeError,'rollback failed'):convert_krita(path,catalog,RESOURCES)
   self.assertTrue(denied_paths);self.assertEqual(catalog.assets,{});self.assertEqual(catalog.brushes,[]);self.assertFalse((catalog.output/'manifest.json').exists())
 def test_preexisting_unregistered_matching_cas_survives_rejected_preset(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);control=Catalog(root/'control');preset(kpp(definition('failed.gbr')),'valid.kpp',control,RESOURCES)
   self.assertTrue(control.assets);catalog=Catalog(root/'output')
   for item in control.assets.values():(catalog.output/item['file']).write_bytes((control.output/item['file']).read_bytes())
   before={p.name:p.read_bytes()for p in catalog.output.iterdir()};path=root/'bad.kpp';path.write_bytes(failed_nested());created=[];asset=catalog.asset
   def track(*args,**kwargs):
    key=asset(*args,**kwargs);created.append(catalog.assets[key]['file']);return key
   with patch.object(catalog,'asset',side_effect=track):convert_krita(path,catalog,RESOURCES)
   self.assertTrue(created);self.assertTrue(set(created).issubset(before));self.assertEqual(catalog.assets,{});self.assertEqual(catalog.brushes,[]);self.assertEqual(len(catalog.skipped),1)
   self.assertEqual({p.name:p.read_bytes()for p in catalog.output.iterdir()},before)
