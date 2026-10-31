"""Source-bound offline dictionary, not shared or renderer admission."""
import copy
import json
import os
import struct
import base64
import tempfile
import subprocess
import sys
import convert
from krita_import import convert_krita
from test_krita import kpp
from pathlib import Path
import unittest
from unittest.mock import patch
from krita_import import xml
from native_curve_arm_v3 import MappedCurveProvider,PROFILE
from source_stamp_data import retain_source_stamp,validate_source_stamp_shape,validate_portable_source_stamp
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
    def test_distinct_profile_and_raw_source_binding_require_trusted_provider(self):
        data=image();pieces=[[[0.,0.,.5,0.]]]
        with patch('source_stamp_mapped.compile_curves_arm_v3',return_value=pieces) as compiler:
            result=compile_mapped_source_stamp(data,PROVIDER)
            verify_mapped_source_stamp(data,result,PROVIDER)
        self.assertEqual(result['version'],2);self.assertEqual(result['profile'],PROFILE)
        self.assertEqual(result['buildId'],'a'*64)
        self.assertEqual(compiler.call_args.args[0],[[[0.,0.,False],[1.,.5,False]]])
        validate_source_stamp_shape({'sourceStamp':{**data,'compiled':result}})
        with self.assertRaises(ValueError):validate_portable_source_stamp({'sourceStamp':{**data,'compiled':result}})

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
                validate_portable_source_stamp({'sourceStamp':{**row['sourceStamp'],'compiled':compiled}},mapped_curve_provider=provider)
                constructor=next(c for c in native['constructors'] if c['generator']['softness_curve']==compiled['radialCurve']['source']['text'])
                for actual,expected in zip(compiled['radialCurve']['coefficients'],constructor['coefficients']):
                    for a,b in zip(actual,expected):self.assertEqual(struct.pack('>d',a),struct.pack('>d',b))


@unittest.skipUnless(os.environ.get('GRAFETTO_MAPPED_CURVE_COMPILER') and os.environ.get('GRAFETTO_MAPPED_CURVE_BUILD_ID'),'Explicit mapped compiler/build ID required')
class ActualMappedImporterTests(unittest.TestCase):
    def test_kpp_and_portable_dispatch_verify_before_any_cas_decode(self):
        provider=MappedCurveProvider(os.environ['GRAFETTO_MAPPED_CURVE_COMPILER'],os.environ['GRAFETTO_MAPPED_CURVE_BUILD_ID'])
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);path=root/'soft.kpp'
            raw='<Brush type="auto_brush"><MaskGenerator id="soft" type="circle" diameter="7" ratio="1" spikes="2" antialiasEdges="0" softness_curve="0,1;1,0"/></Brush>'
            path.write_bytes(kpp(raw));catalog=convert.Catalog(root/'original')
            convert_krita(path,catalog,mapped_curve_provider=provider)
            self.assertFalse(catalog.skipped)
            library=catalog.write();descriptor=library['brushes'][0]['descriptor']
            self.assertEqual(descriptor['sourceStamp']['compiled']['version'],2)
            self.assertEqual(descriptor['sourceStamp']['compiled']['profile'],PROFILE)
            payloads={a['id']:base64.b64encode((catalog.output/a['file']).read_bytes()).decode() for a in library['assets']}
            bundle=root/'roundtrip.grafetto-brushes.json';envelope={'library':library,'assets':payloads};bundle.write_text(json.dumps(envelope))
            output=convert.Catalog(root/'loaded');convert.portable_bundle(bundle,output,mapped_curve_provider=provider)
            self.assertEqual(output.brushes[0]['descriptor']['sourceStamp'],descriptor['sourceStamp'])
            descriptor['sourceStamp']['compiled']['radialCurve']['coefficients'][0][0]+=1e-7
            bundle.write_text(json.dumps(envelope))
            rejected=convert.Catalog(root/'rejected')
            with patch('convert.base64.b64decode',side_effect=AssertionError('unverified source reached CAS')):
                with self.assertRaisesRegex(ValueError,'differ from trusted compiler'):convert.portable_bundle(bundle,rejected,mapped_curve_provider=provider)
            self.assertEqual(rejected.brushes,[]);self.assertEqual(rejected.assets,{})

    def test_cli_requires_explicit_paired_configuration_and_compiles_actual_kpp(self):
        root_script=Path(__file__).with_name('convert.py')
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);path=root/'soft.kpp'
            raw='<Brush type="auto_brush"><MaskGenerator id="soft" type="circle" diameter="7" softness_curve="0,1;1,0"/></Brush>'
            path.write_bytes(kpp(raw))
            for args in [['--mapped-curve-build-id','a'*64],['--mapped-curve-compiler','/explicit/no-build'],
                         ['--native-curve-compiler','/explicit/old','--mapped-curve-compiler','/explicit/new','--mapped-curve-build-id','a'*64]]:
                result=subprocess.run([sys.executable,str(root_script),str(path),'--output',str(root/'bad'),*args],capture_output=True,text=True,timeout=15)
                self.assertEqual(result.returncode,2);self.assertFalse((root/'bad').exists())
            output=root/'cli'
            result=subprocess.run([sys.executable,str(root_script),str(path),'--output',str(output),'--mapped-curve-compiler',os.environ['GRAFETTO_MAPPED_CURVE_COMPILER'],
                                   '--mapped-curve-build-id',os.environ['GRAFETTO_MAPPED_CURVE_BUILD_ID']],capture_output=True,text=True,timeout=15)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(json.loads(result.stdout)['brushes'],1)
            data=json.loads((output/'manifest.json').read_text())
            self.assertEqual(data['brushes'][0]['descriptor']['sourceStamp']['compiled']['profile'],PROFILE)

class NewMappedSoftImporterTests(unittest.TestCase):
    """Synthetic compiler responses prove import gating, not native pixels."""
    RAW='<Brush type="auto_brush"><MaskGenerator id="soft" type="circle" diameter="7" ratio="1" spikes="2" antialiasEdges="0" softness_curve="0,1;1,0"/></Brush>'

    def import_one(self, provider=PROVIDER, extra='', compile_error=None, size=True):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);path=root/'soft.kpp';path.write_bytes(kpp(self.RAW,resources='<param name="PressureSize">'+str(size).lower()+'</param>'+extra))
            catalog=convert.Catalog(root/'out')
            def coefficients(curves, configured):
                self.assertIs(configured,provider)
                if compile_error: raise ValueError(compile_error)
                return [[[0.,0.,0.,0.] for _ in range(len(points)-1)] for points in curves]
            with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=coefficients) as compiler:
                convert_krita(path,catalog,mapped_curve_provider=provider)
            self.assertEqual(catalog.skipped,[])
            return catalog.brushes[0],compiler

    def test_successful_complete_explicit_mapped_import_retires_only_obsolete_frontier(self):
        brush,compiler=self.import_one()
        data=brush['descriptor']['sourceStamp']
        self.assertNotIn('soft-auto-raster-author-unavailable',data['unsupported'])
        self.assertEqual(data['compiled']['buildId'],PROVIDER.expected_build_id)
        self.assertEqual(data['compiled']['radialCurve']['source'],data['source']['softnessCurve'])
        self.assertEqual(len(compiler.call_args.args[0]),2) # Size option AND radial, never radial-only.

    def test_provider_decline_retains_frontier_and_never_publishes_partial_dictionary(self):
        brush,_=self.import_one(compile_error='unsupported-source-branch:panel-bmod-product-unproved')
        data=brush['descriptor']['sourceStamp']
        self.assertIn('soft-auto-raster-author-unavailable',data['unsupported']);self.assertNotIn('compiled',data)
        self.assertTrue(any(n['feature']=='sourceStampCompiler' and 'unsupported-source-branch:' in n['detail'] for n in brush['compatibility']))

    def test_no_provider_and_nonunit_material_keep_frontier(self):
        for provider,extra in [(None,''),(PROVIDER,'<param name="PressureSoftness">true</param><param name="SoftnessValue">0.5</param>')]:
            brush,_=self.import_one(provider=provider,extra=extra)
            self.assertIn('soft-auto-raster-author-unavailable',brush['descriptor']['sourceStamp']['unsupported'])

    def test_invalid_dictionary_or_wrong_build_not_published(self):
        def wrong_build(data,provider):
            compiled=compile_mapped_source_stamp(data,provider)
            compiled['buildId']='b'*64
            return compiled
        for result in [lambda data,provider:{},wrong_build]:
            with patch('source_stamp_mapped.compile_mapped_source_stamp',side_effect=result):
                brush,_=self.import_one()
            actual=brush['descriptor']['sourceStamp']
            self.assertIn('soft-auto-raster-author-unavailable',actual['unsupported']);self.assertNotIn('compiled',actual)

    def test_material_metadata_classifier_has_six_candidates_not_seven_ready_roles(self):
        from krita_import import _new_mapped_soft_material_supported
        root=Path(__file__).resolve().parents[2]
        stock=json.loads((root/'packages/shared/src/fixtures/sourceSoftAutoData/stock.native.ts').read_text().removeprefix('export default '))
        eligible=[]
        for row in stock['rows']:
            descriptor={'model':'stamp','behavior':{},'sourceStamp':row['sourceStamp']}
            if _new_mapped_soft_material_supported(descriptor,row['engine'],int(row['role']=='mask')):eligible.append(row['index'])
        # Classification ONLY: none of these raw originals contains a compiled
        # dictionary, so this is deliberately not a ready/admitted count.
        self.assertEqual(eligible,[3,59,60,61,62,63])
        self.assertEqual(len(stock['rows']),10)
        self.assertTrue(all('compiled' not in row['sourceStamp'] for row in stock['rows']))
        self.assertNotIn(44,eligible);self.assertNotIn(47,eligible);self.assertNotIn(52,eligible);self.assertNotIn(72,eligible)

    def test_domain_tool_role_and_real_material_frontiers_stay_closed(self):
        from krita_import import _new_mapped_soft_material_supported
        base={'model':'stamp','behavior':{},'sourceStamp':soft()}
        for engine,depth in [('colorsmudge',0),('paintbrush',1),('roundmarker',0)]:
            self.assertFalse(_new_mapped_soft_material_supported(base,engine,depth))
        for target,patch_value in [('source',{'antialias':True}),('source',{'ratio':2}),('source',{'density':.5}),
                ('source',{'randomness':.1}),('source',{'spikes':3}),('source',{'diameter':4096}),
                ('flags',{'materialFixed1':False}),('flags',{'textureEnabled':True})]:
            d=copy.deepcopy(base);d['sourceStamp'][target].update(patch_value)
            self.assertFalse(_new_mapped_soft_material_supported(d,'paintbrush',0))
        for behavior in [{'dual':{}},{'colorAdjustment':{}}]:
            d=copy.deepcopy(base);d['behavior']=behavior
            self.assertFalse(_new_mapped_soft_material_supported(d,'paintbrush',0))
        mask=copy.deepcopy(base);mask['sourceStamp']['role']='mask'
        self.assertFalse(_new_mapped_soft_material_supported(mask,'paintbrush',0))

    def test_retirement_preserves_every_unrelated_reason(self):
        brush,_=self.import_one(extra='<param name="ColorSource/Type">gradient</param>')
        self.assertEqual(brush['descriptor']['sourceStamp']['unsupported'],['source-color-provider-unresolved'])

    def test_sensor_identity_still_requires_successful_radial_compile(self):
        brush,compiler=self.import_one(size=False)
        data=brush['descriptor']['sourceStamp']
        self.assertEqual(len(compiler.call_args.args[0]),1)
        self.assertEqual(data['compiled']['curves'],[])
        self.assertIn('radialCurve',data['compiled'])
        self.assertNotIn('soft-auto-raster-author-unavailable',data['unsupported'])

    def test_new_marker_free_dictionary_still_validates_and_verifies_for_portable_roundtrip(self):
        brush,_=self.import_one()
        with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=lambda curves,provider:
                [[[0.,0.,0.,0.] for _ in range(len(points)-1)] for points in curves]):
            validate_portable_source_stamp(brush['descriptor'],mapped_curve_provider=PROVIDER)

    def test_marker_free_spelling_requires_bound_mapped_program_and_preserves_other_reasons(self):
        brush,_=self.import_one();data=brush['descriptor']['sourceStamp']
        original=copy.deepcopy(data)
        edits=[lambda d:d.pop('compiled'),lambda d:d['compiled'].pop('radialCurve'),
               lambda d:d['compiled'].update(profile='eigen-3.4.0-sparselu-f64-no-fma-v1'),
               lambda d:d['compiled'].update(buildId='bad'),lambda d:d['flags'].update(textureEnabled=True),
               lambda d:d['compiled']['radialCurve']['source']['points'][0].update(y=.5),
               lambda d:d['compiled']['radialCurve'].update(coefficients=[]),
               lambda d:d['compiled']['curves'].clear(),lambda d:d['unsupported'].append('forged-reason')]
        for edit in edits:
            changed=copy.deepcopy(data);edit(changed)
            with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=AssertionError('Invalid shape reached compiler')):
                with self.assertRaises(ValueError):validate_portable_source_stamp({'sourceStamp':changed},mapped_curve_provider=PROVIDER)
        self.assertEqual(data,original)

    def test_new_roundtrip_recomputes_coefficients_before_cas_and_old_spelling_is_unchanged(self):
        def coefficients(curves,provider):return [[[0.,0.,0.,0.] for _ in range(len(points)-1)] for points in curves]
        with tempfile.TemporaryDirectory() as directory,patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=coefficients):
            root=Path(directory);path=root/'new.kpp';path.write_bytes(kpp(self.RAW))
            first=convert.Catalog(root/'first');convert_krita(path,first,mapped_curve_provider=PROVIDER)
            library=first.write();data=library['brushes'][0]['descriptor']['sourceStamp']
            self.assertNotIn('soft-auto-raster-author-unavailable',data['unsupported'])
            payloads={a['id']:base64.b64encode((first.output/a['file']).read_bytes()).decode() for a in library['assets']}
            bundle=root/'new.grafetto-brushes.json';bundle.write_text(json.dumps({'library':library,'assets':payloads}))
            second=convert.Catalog(root/'second');convert.portable_bundle(bundle,second,mapped_curve_provider=PROVIDER)
            self.assertEqual(second.brushes[0]['descriptor']['sourceStamp'],data)
            historical=copy.deepcopy(data);historical['unsupported'].insert(0,'soft-auto-raster-author-unavailable')
            snapshot=copy.deepcopy(historical);validate_portable_source_stamp({'sourceStamp':historical},mapped_curve_provider=PROVIDER)
            self.assertEqual(historical,snapshot)
            data['compiled']['radialCurve']['coefficients'][0][0]=.1
            bundle.write_text(json.dumps({'library':library,'assets':payloads}));rejected=convert.Catalog(root/'rejected')
            with patch('convert.base64.b64decode',side_effect=AssertionError('Unverified coefficients reached CAS')):
                with self.assertRaisesRegex(ValueError,'differ from trusted compiler'):convert.portable_bundle(bundle,rejected,mapped_curve_provider=PROVIDER)
            self.assertEqual(rejected.brushes,[]);self.assertEqual(rejected.assets,{})

    def test_normalization_counts_all_compiled_and_remaining_reason_bytes(self):
        brush,_=self.import_one();data=brush['descriptor']['sourceStamp']
        from source_stamp_data import source_stamp_budget,MAX_SOURCE_STAMP_BUDGET
        historical=copy.deepcopy(data);historical['unsupported'].insert(0,'soft-auto-raster-author-unavailable')
        self.assertEqual(source_stamp_budget(historical)-source_stamp_budget(data),len('soft-auto-raster-author-unavailable'))
        with patch('source_stamp_data.MAX_SOURCE_STAMP_BUDGET',source_stamp_budget(data)-1):
            with self.assertRaisesRegex(ValueError,'aggregate budget'):validate_source_stamp_shape({'sourceStamp':data})
        self.assertLess(source_stamp_budget(data),MAX_SOURCE_STAMP_BUDGET)

    def test_malformed_unsupported_fails_validation_before_external_child(self):
        brush,_=self.import_one()
        from source_stamp_data import mapped_soft_frontier_retired,soft_source_material_domain
        for unsupported in [None,{},'soft-auto-raster-author-unavailable',17]:
            data=copy.deepcopy(brush['descriptor']['sourceStamp']);data['unsupported']=unsupported
            self.assertFalse(mapped_soft_frontier_retired(data));self.assertFalse(soft_source_material_domain(data))
            with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=AssertionError('Malformed data reached compiler')):
                with self.assertRaises(ValueError):validate_portable_source_stamp({'sourceStamp':data},mapped_curve_provider=PROVIDER)
