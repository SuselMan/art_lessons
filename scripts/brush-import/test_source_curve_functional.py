"""Source-functional provider tests. Building/running a compiler is ROOT-cued.

Real compiler tests require explicit executable + trusted build identity. The
independent reference is the second-derivative natural spline (Thomas solve),
not previous GPU/native coefficients or the new SparseLU output itself.
"""
import copy
import json
import math
import os
import struct
import unittest
from pathlib import Path
from unittest.mock import patch
import source_curve_functional as api
from curve_transfer import natural_run
from native_curve_arm_v3 import MappedCurveProvider,compile_curves_arm_v3

BUILD='a'*64
PROVIDER=api.SourceFunctionalCurveProvider('/explicit/compiler',BUILD)
GOOD=[[[0.,0.,False],[1.,1.,False]]]
def wire(v):return json.dumps(v,separators=(',',':')).encode('ascii')
DESCRIBE=dict(profile=api.PROFILE,buildId=BUILD,input=dict(api.INPUT))
RESULT=dict(profile=api.PROFILE,buildId=BUILD,curves=[[[0.,0.,1.,0.]]],panelProducts=0,panelWork=0)

class FunctionalBoundaryTests(unittest.TestCase):
 def test_profile_build_and_grammar_are_explicit_no_old_provider_fallback(self):
  with patch.object(api,'_run')as run:
   with self.assertRaises(ValueError):api.compile_source_functional_curves(GOOD,MappedCurveProvider('/explicit/old',BUILD))
   run.assert_not_called()
  for field,value in [('profile','eigen-5.0.1-mapped-arm64-f64-v3'),('buildId','b'*64),('input',{**api.INPUT,'maximumKnots':9})]:
   with self.subTest(field=field),patch.object(api,'_run',return_value=wire({**DESCRIBE,field:value})):
    with self.assertRaises(ValueError):api.compile_source_functional_curves(GOOD,PROVIDER)
 def test_new_10knot_grammar_does_not_widen_old_mapped_provider(self):
  points=[[i/9,(i%3)/2,False]for i in range(10)]
  with patch('native_curve_arm_v3._run')as run:
   with self.assertRaisesRegex(ValueError,'grammar'):compile_curves_arm_v3([points],MappedCurveProvider('/explicit/old',BUILD))
   run.assert_not_called()
  pieces=[[[0.,0.,0.,0.]]*9]
  with patch.object(api,'_run',side_effect=[wire(DESCRIBE),wire({**RESULT,'curves':pieces})])as run:
   self.assertEqual(api.compile_source_functional_curves([points],PROVIDER),pieces);self.assertEqual(run.call_count,2)
 def test_33_knots_and_endpoint_corners_fail_before_child(self):
  for points in [[[i/32,i/32,False]for i in range(33)],[[0.,0.,True],[1.,1.,False]]]:
   with patch.object(api,'_run')as run:
    with self.assertRaises(ValueError):api.compile_source_functional_curves([points],PROVIDER)
    run.assert_not_called()
 def test_bounded_work_and_finite_coefficients_checked(self):
  for altered in [{'panelProducts':65537},{'panelWork':16*1024*1024+1},{'panelProducts':True},{'curves':[[[0.,0.,1.,float('nan')]]]}]:
   with patch.object(api,'_run',side_effect=[wire(DESCRIBE),wire({**RESULT,**altered})]):
    with self.assertRaises(ValueError):api.compile_source_functional_curves(GOOD,PROVIDER)
 def test_common_compiled2_profile_not_relabelled_and_raw_option_order_unchanged(self):
  from source_stamp_mapped import compile_mapped_source_stamp,validate_mapped_source_stamp_shape
  from source_stamp_data import retain_source_stamp
  from krita_import import xml
  definition='<Brush type="png_brush" filename="self.png" BrushVersion="2"/>'
  raw=retain_source_stamp({'brush_definition':definition,'SizecommonCurve':'0,0;1,.5;','PressureSize':'true'},xml(definition),3,5,xml)
  before=copy.deepcopy(raw)
  with patch('source_stamp_mapped.compile_source_functional_curves',return_value=[[[0.,0.,.5,0.]]]):
   compiled=compile_mapped_source_stamp(raw,PROVIDER)
  self.assertEqual(compiled['profile'],api.PROFILE);self.assertEqual(compiled['version'],2);self.assertEqual(raw,before)
  validate_mapped_source_stamp_shape(raw,compiled)
  with self.assertRaises(ValueError):compile_mapped_source_stamp(raw,PROVIDER,texture_strength=True)

class FunctionalSoftRoundtripTests(unittest.TestCase):
 def test_retired_soft_reason_requires_valid_functional_compiled_raw_binding(self):
  import tempfile
  import convert
  from krita_import import convert_krita
  from test_krita import kpp
  from source_stamp_data import validate_portable_source_stamp
  from source_stamp_mapped import validate_mapped_source_stamp_shape
  raw='<Brush type="auto_brush"><MaskGenerator id="soft" type="circle" diameter="7" ratio="1" spikes="2" antialiasEdges="0" softness_curve="0,1;1,0"/></Brush>'
  def coefficients(curves,provider):return [[[0.,0.,0.,0.]for _ in range(len(points)-1)]for points in curves]
  with tempfile.TemporaryDirectory()as directory,patch('source_stamp_mapped.compile_source_functional_curves',side_effect=coefficients):
   root=Path(directory);source=root/'soft.kpp';source.write_bytes(kpp(raw));catalog=convert.Catalog(root/'catalog')
   convert_krita(source,catalog,mapped_curve_provider=PROVIDER)
   data=catalog.write()['brushes'][0]['descriptor']['sourceStamp']
   self.assertNotIn('soft-auto-raster-author-unavailable',data['unsupported'])
   validate_mapped_source_stamp_shape(data,data['compiled'])
   validate_portable_source_stamp({'sourceStamp':data},mapped_curve_provider=PROVIDER)
   bad=copy.deepcopy(data);bad['compiled']['radialCurve']['coefficients'][0][0]=.25
   with self.assertRaisesRegex(ValueError,'differ from trusted compiler'):validate_portable_source_stamp({'sourceStamp':bad},mapped_curve_provider=PROVIDER)

EXECUTABLE=os.environ.get('GRAFETTO_SOURCE_FUNCTIONAL_CURVE_COMPILER')
BUILD_ID=os.environ.get('GRAFETTO_SOURCE_FUNCTIONAL_CURVE_BUILD_ID')
@unittest.skipUnless(EXECUTABLE and BUILD_ID,'ROOT must build/pin a new source-functional provider explicitly')
class FunctionalRealCompilerTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.provider=api.SourceFunctionalCurveProvider(EXECUTABLE,BUILD_ID)
  cls.inputs=json.loads((Path(__file__).parent/'fixtures/source_functional_curves.json').read_text())['curves']
 def test_nonlinear_10_22_and_actual_panel_curves_match_independent_natural_spline(self):
  points=[[[v['x'],v['y'],v['corner']]for v in item['points']]for item in self.inputs]
  result=api.compile_source_functional_result(points,self.provider)
  self.assertGreater(result['panelProducts'],0);self.assertGreater(result['panelWork'],0)
  self.assertLessEqual(result['panelWork'],16*1024*1024)
  for item,pieces in zip(self.inputs,result['curves']):
   reference=natural_run([(p['x'],p['y'])for p in item['points']]);pts=item['points']
   for x in [p['x']for p in pts]+[i/256 for i in range(257)]:
    if x<pts[0]['x']or x>pts[-1]['x']:continue
    index=next((i for i in range(len(pieces))if x<pts[i+1]['x']),len(pieces)-1)
    a,b,c,d=pieces[index];actual=((a*x+b)*x+c)*x+d
    self.assertAlmostEqual(actual,reference(x),delta=5e-7,msg=item['label']+' x='+str(x))
 def test_deterministic_binary64_output_and_atomic_late_reject(self):
  points=[[[p['x'],p['y'],p['corner']]for p in item['points']]for item in self.inputs]
  first=api.compile_source_functional_curves(points,self.provider);second=api.compile_source_functional_curves(points,self.provider)
  self.assertEqual([[struct.pack('>d',v)for row in c for v in row]for c in first],[[struct.pack('>d',v)for row in c for v in row]for c in second])
  # Child stdin bypasses provider precheck ONLY as an explicit malformed protocol test.
  from native_curve_compile import _input
  from native_curve_arm_v3 import _run
  bad=points+[[[i/32,i/32,False]for i in range(33)]]
  with self.assertRaises(ValueError):_run(self.provider.executable,[],_input(bad).encode('ascii'),timeout=15,maximum_output=128*1024)

if __name__=='__main__':unittest.main()
