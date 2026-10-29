"""Explicit native-provider roundtrip; fixtures are source-law or self-authored data."""
import base64
import copy
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image
import convert
from brush_contract import finalize_identity
from krita_import import convert_krita, xml
from native_curve_compile import compile_curves, PROFILE
from source_stamp_data import compile_source_stamp, required_source_curves, retain_source_stamp, validate_portable_source_stamp, validate_source_stamp_shape
from test_krita import kpp

ROOT=Path(__file__).resolve().parents[2]
EXE=os.environ.get('GRAFETTO_NATIVE_CURVE_COMPILER')
DEFINITION='<Brush type="png_brush" filename="self.png" BrushVersion="2"/>'


def retained(text='0,0;1,0.5;',**params):
    settings={'brush_definition':DEFINITION,'SizecommonCurve':text,'PressureSize':'true',**params}
    return retain_source_stamp(settings,xml(DEFINITION),3,5,xml)


class SourceCompiledBoundaryTests(unittest.TestCase):
    def test_disabled_saved_nonlinear_curves_never_require_provider(self):
        for setting in ({'PressureSize':'false'},{'SizeUseCurve':'false'}):
            data=retained(**setting)
            self.assertEqual(required_source_curves(data),[])
            with patch('source_stamp_data.compile_curves',side_effect=AssertionError('unused curve compiled')):
                data['compiled']=compile_source_stamp(data,'/explicit/unused/compiler')
            self.assertEqual(data['compiled']['curves'],[])
            validate_source_stamp_shape({'sourceStamp':data})
            self.assertEqual(data['options'][0]['sensors'][0]['curve']['text'],'0,0;1,0.5;')

    def test_selected_shared_curves_are_compiled_once_in_stable_slot_order(self):
        data=retained(RotationcommonCurve='0,0;1,0.5;',PressureRotation='true')
        with patch('source_stamp_data.compile_curves',return_value=[[[0,0,.5,0]]]) as compiler:
            compiled=compile_source_stamp(data,'/explicit/compiler')
        self.assertEqual(len(compiled['curves']),1)
        self.assertEqual(len(compiler.call_args.args[0]),1)
        data['compiled']=compiled;validate_source_stamp_shape({'sourceStamp':data})

    def test_import_never_takes_executable_from_KPP_or_environment(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);path=root/'self.kpp'
            path.write_bytes(kpp(DEFINITION,resources='<param name="PressureSize">true</param><param name="CurveCompilerExecutable">/untrusted/kpp</param>'))
            image=io.BytesIO();Image.new('L',(3,5),0).save(image,format='PNG')
            with patch.dict(os.environ,{'GRAFETTO_NATIVE_CURVE_COMPILER':'/untrusted/environment'}),patch('native_curve_compile.subprocess.run') as process:
                catalog=convert.Catalog(root/'out');convert_krita(path,catalog,{'self.png':image.getvalue()})
                process.assert_not_called()
            self.assertFalse(catalog.skipped);self.assertNotIn('compiled',catalog.brushes[0]['descriptor']['sourceStamp'])
            self.assertTrue(any(n['feature']=='sourceStampCompiler' and n['status']=='unsupported' for n in catalog.brushes[0]['compatibility']))

    def test_missing_provider_never_accepts_claimed_profile_as_attestation(self):
        data=retained();source=data['options'][0]['sensors'][0]['curve']
        data['compiled']={'version':1,'reader':data['reader'],'profile':PROFILE,'curves':[{'source':source,'coefficients':[[0,0,.5,0]]}]}
        validate_source_stamp_shape({'sourceStamp':data})
        with self.assertRaisesRegex(ValueError,'explicit trusted'):validate_portable_source_stamp({'sourceStamp':data})
        del data['compiled']
        validate_portable_source_stamp({'sourceStamp':data})

    def test_compiler_work_budget_is_checked_before_any_process(self):
        for count,knots in ((65,2),(17,256)):
            data=retained();curves=[]
            for index in range(count):
                points=[{'x':i/(knots-1),'y':(index+1)/(count+2),'corner':False} for i in range(knots)]
                text=';'.join(str(p['x'])+','+str(p['y']) for p in points)+';'
                curves.append({'curve':{'text':text,'points':points}})
            data['options']=[{'checked':True,'useCurve':True,'sensors':curves}]
            with patch('source_stamp_data.compile_curves') as compiler:
                with self.assertRaisesRegex(ValueError,'work budget'):compile_source_stamp(data,'/explicit/compiler')
                compiler.assert_not_called()

    def test_predicted_compiled_data_budget_rejects_before_process(self):
        data=retained(' '*64000+'0,0;1,0.5;',**{'PressureUnused'+str(i):'x'*54000 for i in range(15)})
        with patch('source_stamp_data.compile_curves') as compiler:
            with self.assertRaisesRegex(ValueError,'aggregate budget'):compile_source_stamp(data,'/explicit/compiler')
            compiler.assert_not_called()

    def test_dictionary_rejects_duplicate_extra_misbound_or_wrong_profile_records(self):
        original=retained();source=original['options'][0]['sensors'][0]['curve']
        original['compiled']={'version':1,'reader':original['reader'],'profile':PROFILE,'curves':[{'source':source,'coefficients':[[0,0,.5,0]]}]}
        edits=(lambda d:d['compiled'].update(profile='claimed-vendor'),lambda d:d['compiled']['curves'].append(copy.deepcopy(d['compiled']['curves'][0])),
               lambda d:d['compiled']['curves'][0]['source']['points'][0].update(corner=True),lambda d:d['compiled']['curves'][0].update(coefficients=[]),
               lambda d:d['compiled']['curves'][0].update(coefficients=[[True,0,.5,0]]))
        for edit in edits:
            data=copy.deepcopy(original);edit(data)
            with self.assertRaises(ValueError):validate_source_stamp_shape({'sourceStamp':data})


@unittest.skipUnless(EXE,'explicit native provider required for compiler integration')
class SourceCompiledNativeTests(unittest.TestCase):
    def test_all_67_actual_native_curve_outputs_roundtrip_and_schema_valid_forgery_rejected_before_CAS(self):
        stock=json.loads((ROOT/'apps/web/src/engine/src/presets/fixtures/sourceCurves.native.json').read_text())['curves']
        arbitrary=json.loads((Path(__file__).parent/'fixtures/source_curve_arbitrary.native.json').read_text())
        cases=[(c['points'],c['coefficients']) for c in stock]+list(zip(arbitrary['inputs'],arbitrary['coefficients']))
        self.assertEqual(len(cases),67)
        # Includes identity cases which correctly need no persisted dictionary entry.
        for batch in (cases[:32],cases[32:]):self.assertEqual(compile_curves([c[0] for c in batch],EXE),[c[1] for c in batch])
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);path=root/'self.kpp';path.write_bytes(kpp(DEFINITION))
            image=io.BytesIO();Image.new('L',(3,5),0).save(image,format='PNG')
            catalog=convert.Catalog(root/'authored');convert_krita(path,catalog,{'self.png':image.getvalue()});self.assertFalse(catalog.skipped)
            base=catalog.write();payloads={a['id']:base64.b64encode((catalog.output/a['file']).read_bytes()).decode() for a in base['assets']}
            for index,(points,expected) in enumerate(cases):
                text=';'.join(repr(x)+','+repr(y)+(',is_corner' if corner else '') for x,y,corner in points)+';'
                data=retained(text);data['compiled']=compile_source_stamp(data,EXE)
                if data['compiled']['curves']:self.assertEqual(data['compiled']['curves'][0]['coefficients'],expected)
                library=copy.deepcopy(base);descriptor=library['brushes'][0]['descriptor'];descriptor['sourceStamp']=data;finalize_identity(descriptor,('native-input-'+str(index)).encode())
                envelope={'library':library,'assets':payloads};bundle=root/'roundtrip.json';bundle.write_text(json.dumps(envelope))
                output=convert.Catalog(root/'loaded');convert.portable_bundle(bundle,output,curve_compiler=EXE)
                self.assertEqual(output.brushes[0]['descriptor']['sourceStamp'],data)
                if data['compiled']['curves']:
                    data['compiled']['curves'][0]['coefficients'][0][0]+=1e-7
                    bundle.write_text(json.dumps(envelope))
                    with patch('convert.base64.b64decode',side_effect=AssertionError('forgery reached CAS decoding')):
                        with self.assertRaisesRegex(ValueError,'differ from native compiler'):convert.portable_bundle(bundle,convert.Catalog(root/'rejected'),curve_compiler=EXE)

    def test_real_KPP_converter_compiles_only_with_explicit_provider_and_preserves_legacy_behavior(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);path=root/'self.kpp';path.write_bytes(kpp(DEFINITION,resources='<param name="PressureSize">true</param>'))
            image=io.BytesIO();Image.new('L',(3,5),0).save(image,format='PNG');resource={'self.png':image.getvalue()}
            outputs=[]
            for label,exe in [('raw',None),('compiled',EXE),('failed','/explicit/missing/compiler')]:
                catalog=convert.Catalog(root/label);convert_krita(path,catalog,resource,curve_compiler=exe);self.assertFalse(catalog.skipped);outputs.append(catalog.brushes[0])
            raw,compiled,failed=outputs
            self.assertNotIn('compiled',raw['descriptor']['sourceStamp']);self.assertNotIn('compiled',failed['descriptor']['sourceStamp'])
            self.assertIn('compiled',compiled['descriptor']['sourceStamp'])
            self.assertEqual(raw['descriptor']['behavior'],compiled['descriptor']['behavior'])
            self.assertTrue(any(n['feature']=='sourceStampCompiler' and n['status']=='unsupported' for n in failed['compatibility']))
            self.assertNotEqual(raw['descriptor']['id'],compiled['descriptor']['id'])
            validate_portable_source_stamp(compiled['descriptor'],EXE)

if __name__=='__main__':unittest.main()
