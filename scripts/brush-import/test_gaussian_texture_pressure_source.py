"""Gaussian pressure DATA boundaries; provider oracle is separately pinned."""
import copy,json,unittest
from pathlib import Path
from unittest.mock import patch
from native_curve_arm_v3 import MappedCurveProvider
from source_stamp_data import (gaussian_texture_pressure_source_curve,texture_pressure_source_curve,
                              validate_source_stamp_shape,required_source_curves)
from source_stamp_mapped import compile_mapped_source_stamp,verify_mapped_source_stamp
from krita_import import _gaussian_texture_pressure_data_candidate,_texture_pressure_data_candidate
ROOT=Path(__file__).resolve().parents[2]
FIXTURE=ROOT/'packages/shared/src/fixtures/sourceGaussianAutoData/pencil3.texture-pressure.compiled3.metadata.json'
PROVIDER=MappedCurveProvider('/explicit/trusted/compiler','a'*64)

def structural(curves,provider):
    return [[[0.,0.,1.,0.] for _ in range(len(c)-1)] for c in curves]

class GaussianTexturePressureDataTests(unittest.TestCase):
    def setUp(self):
        self.descriptor=json.loads(FIXTURE.read_text())['descriptor'];self.data=self.descriptor['sourceStamp']
    def test_existing_schema_accepts_genuine_normal_gaussian_compiled3(self):
        validate_source_stamp_shape({'sourceStamp':self.data})
        self.assertEqual(self.data['source']['kind'],'gaussianAuto')
        self.assertEqual(self.data['compiled']['textureStrength']['curve']['source']['text'],
                         '0,0;0.129397,0.0648241;0.513819,0.714071;0.758794,0.768844;')
    def test_separate_family_with_exact_original_random_flags_no_default_grant(self):
        self.assertIsNone(texture_pressure_source_curve(self.data))
        self.assertFalse(_texture_pressure_data_candidate(self.descriptor))
        self.assertTrue(_gaussian_texture_pressure_data_candidate(self.descriptor))
        self.assertEqual(len(gaussian_texture_pressure_source_curve(self.data)['points']),4)
        self.assertEqual(self.descriptor['texture']['offset'],dict(x=1,y=65,randomX=True,randomY=True))
    def test_same_nine_options_batch_old2_portable_and_no_mutation(self):
        before=copy.deepcopy(self.data)
        with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=structural)as compiler:
            old=compile_mapped_source_stamp(self.data,PROVIDER)
            new=compile_mapped_source_stamp(self.data,PROVIDER,texture_strength=True)
            verify_mapped_source_stamp(self.data,old,PROVIDER)
            verify_mapped_source_stamp(self.data,new,PROVIDER)
        self.assertEqual(old['version'],2);self.assertNotIn('textureStrength',old)
        self.assertEqual(new['version'],3);self.assertEqual(old['curves'],new['curves'])
        self.assertEqual(new['textureStrength']['curve']['source'],gaussian_texture_pressure_source_curve(self.data))
        self.assertEqual(len(compiler.call_args.args[0]),len(required_source_curves(self.data))+1)
        self.assertEqual(self.data,before)
    def test_raw_sensor_dtd_and_unknown_strength_fail_before_provider(self):
        for xml in ['<params id="fade"><curve>0,0;1,1;</curve></params>',
                    '<!DOCTYPE params [<!ENTITY x "0,0;1,1;">]><params id="pressure"><curve>&x;</curve></params>',
                    '<params id="pressure" extra="x"><curve>0,0;1,1;</curve></params>',
                    '<params id="sensorslist"><ChildSensor id="pressure"/></params>']:
            bad=copy.deepcopy(self.data);bad['settings']['Texture/Strength/Sensor']=xml
            self.assertIsNone(gaussian_texture_pressure_source_curve(bad))
            with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=AssertionError('must not run')):
                with self.assertRaises(ValueError):compile_mapped_source_stamp(bad,PROVIDER,texture_strength=True)
    def test_closed_candidate_and_unknown_geometry_never_widen(self):
        for change in [lambda d:d['sourceStamp']['source'].update(antialias=True),
                       lambda d:d['sourceStamp']['source'].update(ratio=1.1),
                       lambda d:d['sourceStamp']['source'].update(randomness=.1),
                       lambda d:d['sourceStamp']['flags'].update(materialFixed1=False),
                       lambda d:d['texture']['offset'].update(randomX=False),
                       lambda d:d['texture']['application'].update(mode='multiply'),
                       lambda d:d.setdefault('behavior',{}).update(dual={'unsupported':True})]:
            bad=copy.deepcopy(self.descriptor);change(bad)
            self.assertFalse(_gaussian_texture_pressure_data_candidate(bad))
    def test_budget_rejects_before_provider_and_provider_failure_not_old2_fallback(self):
        with patch('source_stamp_mapped.MAX_SOURCE_STAMP_BUDGET',1),patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=AssertionError('must not run')):
            with self.assertRaisesRegex(ValueError,'budget'):compile_mapped_source_stamp(self.data,PROVIDER,texture_strength=True)
        before=copy.deepcopy(self.data)
        with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=ValueError('owned provider failed')):
            with self.assertRaisesRegex(ValueError,'provider failed'):compile_mapped_source_stamp(self.data,PROVIDER,texture_strength=True)
        self.assertEqual(self.data,before)
    def test_changed_slot_source_or_bad_coefficients_refuse_without_provider(self):
        for change in [lambda c:c['textureStrength'].update(kind='other'),
                       lambda c:c['textureStrength']['curve']['source'].update(text='0,0;1,1;'),
                       lambda c:c['textureStrength']['curve'].update(coefficients=[])]:
            bad=copy.deepcopy(self.data['compiled']);change(bad)
            with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=AssertionError('must not run')):
                with self.assertRaises(ValueError):verify_mapped_source_stamp(self.data,bad,PROVIDER)
    def test_normal_gaussian_import_provider_failure_has_no_partial3_or2(self):
        import io,tempfile
        from PIL import Image,PngImagePlugin
        from brush_contract import Catalog
        from krita_import import convert_krita
        # Self-authored negative KPP/resource; genuine positive is separate native proof.
        fields=dict(self.data['settings']);fields.update({'Texture/Pattern/PatternFileName':'self.png',
            'Texture/Pattern/TexturingMode':'1','Texture/Pattern/UseSoftTexturing':'false',
            'Texture/Pattern/OffsetX':'1','Texture/Pattern/OffsetY':'65',
            'Texture/Pattern/isRandomOffsetX':'true','Texture/Pattern/isRandomOffsetY':'true'})
        params=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>'for k,v in fields.items())
        pixels=io.BytesIO();Image.new('L',(8,8),128).save(pixels,format='PNG')
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp);path=root/'self.kpp';info=PngImagePlugin.PngInfo();info.add_text('version','5.0')
            info.add_text('preset','<Preset name="QA" paintopid="paintbrush">'+params+'</Preset>',zip=True)
            Image.new('RGB',(2,2),'red').save(path,format='PNG',pnginfo=info)
            catalog=Catalog(root/'out')
            with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=ValueError('owned Gaussian provider failure'))as native:
                convert_krita(path,catalog,{'self.png':pixels.getvalue()},mapped_curve_provider=PROVIDER)
            native.assert_called_once();self.assertEqual(len(catalog.brushes),1)
            result=catalog.brushes[0];self.assertEqual(result['descriptor']['sourceStamp']['source']['kind'],'gaussianAuto')
            self.assertNotIn('compiled',result['descriptor']['sourceStamp'])
            self.assertNotEqual(result['descriptor']['version'],37)
            self.assertTrue(any(n['feature']=='sourceStampCompiler'and'owned Gaussian provider failure'in n['detail']and n['status']=='unsupported'for n in result['compatibility']))
