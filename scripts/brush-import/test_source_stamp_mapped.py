"""Source-bound offline dictionary, not shared or renderer admission."""
import copy
import json
import os
import struct
from pathlib import Path
import unittest
from unittest.mock import patch
from krita_import import xml
from native_curve_arm_v3 import MappedCurveProvider,PROFILE
from source_stamp_data import retain_source_stamp,validate_source_stamp_shape
from source_stamp_mapped import compile_mapped_source_stamp,verify_mapped_source_stamp

PROVIDER=MappedCurveProvider('/explicit/trusted/compiler','a'*64)
IMAGE='<Brush type="png_brush" filename="self.png" BrushVersion="2"/>'


def image(**params):
    params={'brush_definition':IMAGE,'SizecommonCurve':'0,0;1,.5;','PressureSize':'true',**params}
    return retain_source_stamp(params,xml(IMAGE),3,5,xml)


def soft(curve='0,0;1,1'):
    raw=f'<Brush type="auto_brush"><MaskGenerator id="soft" type="circle" diameter="7" softness_curve="{curve}"/></Brush>'
    return retain_source_stamp({'brush_definition':raw},xml(raw),7,7,xml)


class MappedSourceBindingTests(unittest.TestCase):
    def test_distinct_profile_and_raw_source_binding_without_shared_admission(self):
        data=image();pieces=[[[0.,0.,.5,0.]]]
        with patch('source_stamp_mapped.compile_curves_arm_v3',return_value=pieces) as compiler:
            result=compile_mapped_source_stamp(data,PROVIDER)
            verify_mapped_source_stamp(data,result,PROVIDER)
        self.assertEqual(result['version'],2);self.assertEqual(result['profile'],PROFILE)
        self.assertEqual(result['buildId'],'a'*64)
        self.assertEqual(compiler.call_args.args[0],[[[0.,0.,False],[1.,.5,False]]])
        # Existing portable schema stays closed until explicit migration.
        with self.assertRaises(ValueError):validate_source_stamp_shape({'sourceStamp':{**data,'compiled':result}})

    def test_radial_identity_compiles_even_when_all_sensor_curves_are_identity(self):
        data=soft()
        with patch('source_stamp_mapped.compile_curves_arm_v3',return_value=[[[0.,0.,1.,0.]]]) as compiler:
            result=compile_mapped_source_stamp(data,PROVIDER)
            verify_mapped_source_stamp(data,result,PROVIDER)
        self.assertEqual(result['curves'],[])
        self.assertEqual(result['radialCurve']['source'],data['source']['softnessCurve'])
        self.assertEqual(len(compiler.call_args.args[0]),1)

    def test_disabled_sensor_does_not_request_unused_compilation(self):
        data=image(PressureSize='false')
        with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=AssertionError('unused')):
            result=compile_mapped_source_stamp(data,PROVIDER)
            verify_mapped_source_stamp(data,result,PROVIDER)
        self.assertEqual(result['curves'],[])

    def test_mutation_does_not_rebind_compiler_result(self):
        data=image();original=copy.deepcopy(data['options'][0]['sensors'][0]['curve'])
        def compile_curves(curves,provider):
            data['options'][0]['sensors'][0]['curve']['points'][1]['y']=.75
            return [[[0.,0.,.5,0.]]]
        with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=compile_curves):result=compile_mapped_source_stamp(data,PROVIDER)
        self.assertEqual(result['curves'][0]['source'],original)

    def test_wrong_build_unknown_fields_raw_changes_and_nonfinite_fail_before_child(self):
        data=image()
        with patch('source_stamp_mapped.compile_curves_arm_v3',return_value=[[[0.,0.,.5,0.]]]):result=compile_mapped_source_stamp(data,PROVIDER)
        for edit in [lambda r:r.update(buildId='b'*64),lambda r:r.update(extra=True),lambda r:r.update(profile='eigen-3.4.0-sparselu-f64-no-fma-v1'),
                     lambda r:r['curves'][0]['source']['points'][1].update(y=.75),lambda r:r['curves'][0].update(coefficients=[[0.,0.,float('nan'),0.]]),
                     lambda r:r['curves'][0].update(coefficients=[[0.,0.,10**1000,0.]])]:
            bad=copy.deepcopy(result);edit(bad)
            with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=AssertionError('untrusted child request')):
                with self.assertRaises(ValueError):verify_mapped_source_stamp(data,bad,PROVIDER)

    def test_compiled_budget_denial_happens_before_child(self):
        data=image(SizecommonCurve=' '*63000+'0,0;1,.5;',**{'PressureUnused'+str(i):'x'*50000 for i in range(16)})
        with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=AssertionError('unreserved compiler work')):
            with self.assertRaisesRegex(ValueError,'aggregate budget'):compile_mapped_source_stamp(data,PROVIDER)

    def test_regeneration_checks_signed_zero_and_changed_coefficients_exactly(self):
        data=image()
        with patch('source_stamp_mapped.compile_curves_arm_v3',return_value=[[[-0.,0.,.5,0.]]]):result=compile_mapped_source_stamp(data,PROVIDER)
        for value in [0.,.001]:
            bad=copy.deepcopy(result);bad['curves'][0]['coefficients'][0][0]=value
            with patch('source_stamp_mapped.compile_curves_arm_v3',return_value=[[[-0.,0.,.5,0.]]]):
                with self.assertRaises(ValueError):verify_mapped_source_stamp(data,bad,PROVIDER)


class ActualMappedSourceBindingTests(unittest.TestCase):
    @unittest.skipUnless(os.environ.get('GRAFETTO_MAPPED_CURVE_COMPILER') and os.environ.get('GRAFETTO_MAPPED_CURVE_BUILD_ID'),'Explicit mapped compiler/build ID required')
    def test_all_original_soft_roles_compile_and_reverify_with_actual_provider(self):
        root=Path(__file__).resolve().parents[2]
        text=(root/'packages/shared/src/fixtures/sourceSoftAutoData/stock.native.ts').read_text()
        stock=json.loads(text.removeprefix('export default '))
        native=json.loads((root/'apps/web/src/engine/src/presets/fixtures/sourceSoftCircle/tables.native.json').read_text())
        provider=MappedCurveProvider(os.environ['GRAFETTO_MAPPED_CURVE_COMPILER'],os.environ['GRAFETTO_MAPPED_CURVE_BUILD_ID'])
        for row in stock['rows']:
            with self.subTest(index=row['index'],role=row['role']):
                compiled=compile_mapped_source_stamp(row['sourceStamp'],provider)
                verify_mapped_source_stamp(row['sourceStamp'],compiled,provider)
                constructor=next(c for c in native['constructors'] if c['generator']['softness_curve']==compiled['radialCurve']['source']['text'])
                for actual,expected in zip(compiled['radialCurve']['coefficients'],constructor['coefficients']):
                    for a,b in zip(actual,expected):self.assertEqual(struct.pack('>d',a),struct.pack('>d',b))
