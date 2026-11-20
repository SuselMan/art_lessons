import unittest
from krita_import import sensor_controls
class Scatter148Tests(unittest.TestCase):
 def test_explicit_root_policy_retains_strength_and_native_sum(self):
  params={'ScatterValue':'4','ScattercurveMode':'1','ScatterSensor':'<params id="sensorslist"><ChildSensor id="pressure"/><ChildSensor id="speed"/></params>'}
  notes=[];control=sensor_controls(params,'Scatter',notes,allow_scatter_policy=True)[0]
  self.assertEqual(control['combine']['policy'],'native-scatter-v1');self.assertEqual(control['combine']['constant'],4);self.assertEqual(control['combine']['mode'],'sum');self.assertEqual(len(control['combine']['scaling']),2)
  notes=[];self.assertEqual(sensor_controls(params,'Scatter',notes),[]);self.assertTrue(any(n['status']=='unsupported'for n in notes))
 def native(self,amount='4',extra=''):
  from pathlib import Path
  from tempfile import TemporaryDirectory
  from test_krita import kpp
  from brush_contract import Catalog
  from krita_import import preset
  params='<param name="PressureScatter">true</param><param name="ScatterValue">'+amount+'</param><param name="ScattercurveMode">1</param><param name="ScatterSensor"><![CDATA[<params id="sensorslist"><ChildSensor id="pressure"/><ChildSensor id="speed"/></params>]]></param>'+extra
  with TemporaryDirectory()as folder:return preset(kpp(resources=params),'scatter.kpp',Catalog(Path(folder)),{})
 def test_native_whole_descriptor_and_portable_exact_roundtrip(self):
  import json,tempfile
  from pathlib import Path
  from brush_contract import Catalog
  from convert import portable_bundle
  result=self.native();d=result['descriptor'];self.assertEqual(d['version'],148);self.assertEqual(d['scatter']['radius'],4);self.assertEqual(d['behavior']['modulations']['scatter'][0]['combine']['constant'],4)
  with tempfile.TemporaryDirectory()as folder:
   p=Path(folder)/'scatter.grafetto-brushes.json';p.write_text(json.dumps({'library':{'schemaVersion':1,'assets':[],'skipped':[],'brushes':[result]},'assets':{}}));c=Catalog(Path(folder)/'output');portable_bundle(p,c);self.assertEqual(c.brushes,[result])
 def test_portable_placement_downgrade_mismatch_and_child_fail_before_outputs(self):
  import json,tempfile,copy
  from pathlib import Path
  from brush_contract import Catalog
  from convert import portable_bundle
  result=self.native()
  def wrong_target(d):d['behavior']['modulations']['size']=d['behavior']['modulations'].pop('scatter')
  def child(d):
   child=copy.deepcopy(d);d['id']='imported-'+'a'*24;d.pop('scatter');d['behavior'].pop('scatter');d['behavior'].pop('modulations');d['behavior']['dual']={'brush':child,'blendMode':'normal','sampling':'independent'}
  for mutate in [lambda d:d.update(version=147),lambda d:d['scatter'].update(radius=3),wrong_target,child,lambda d:d['behavior']['modulations']['scatter'].append(copy.deepcopy(d['behavior']['modulations']['scatter'][0]))]:
   b=copy.deepcopy(result);mutate(b['descriptor'])
   with self.subTest(mutate=mutate),tempfile.TemporaryDirectory()as folder:
    p=Path(folder)/'bad.grafetto-brushes.json';p.write_text(json.dumps({'library':{'schemaVersion':1,'assets':[],'skipped':[],'brushes':[b]},'assets':{}}));c=Catalog(Path(folder)/'output')
    with self.assertRaises(ValueError):portable_bundle(p,c)
    self.assertEqual(c.brushes,[]);self.assertEqual(list((Path(folder)/'output').rglob('*.bin')),[])
 def test_native_outside_strength_bound_preserves_truthful_old_fallback(self):
  d=self.native('4.5');self.assertNotEqual(d['descriptor']['version'],148);self.assertTrue(any(n['status']=='unsupported'and n['feature']=='ScatterSensorCombination'for n in d['compatibility']))
 def test_private_adapter_origin_does_not_gain_new_policy(self):
  from pathlib import Path
  from tempfile import TemporaryDirectory
  from test_krita import kpp
  from brush_contract import Catalog
  from krita_import import preset
  params='<param name="PressureScatter">true</param><param name="ScatterValue">4</param><param name="ScattercurveMode">1</param><param name="ScatterSensor"><![CDATA[<params id="sensorslist"><ChildSensor id="pressure"/><ChildSensor id="speed"/></params>]]></param>'
  with TemporaryDirectory()as folder:r=preset(kpp(resources=params),'private.kpp',Catalog(Path(folder)),{},_allow_texture_material=False)
  self.assertNotEqual(r['descriptor']['version'],148);self.assertTrue(any(n['status']=='unsupported'and n['feature']=='ScatterSensorCombination'for n in r['compatibility']))
