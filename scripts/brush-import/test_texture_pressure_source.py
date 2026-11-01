"""Structural compiler integration only; real provider gate is separate."""
import copy
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from native_curve_arm_v3 import MappedCurveProvider
from source_stamp_data import texture_pressure_source_curve, required_source_curves, validate_source_stamp_shape
from source_stamp_mapped import compile_mapped_source_stamp, verify_mapped_source_stamp
from krita_import import _texture_pressure_data_candidate

ROOT=Path(__file__).resolve().parents[2]
FIXTURE=ROOT/'packages/shared/src/fixtures/sourceDefaultAutoData/textureReptile.pressure.metadata.json'
PROVIDER=MappedCurveProvider('/explicit/trusted/compiler','a'*64)

class TexturePressureSourceTests(unittest.TestCase):
    def setUp(self):
        self.descriptor=json.loads(FIXTURE.read_text())['descriptor']
        self.data=self.descriptor['sourceStamp']

    def test_original_compiled2_unchanged_and_explicit_batch_slot(self):
        before=copy.deepcopy(self.data)
        strength=texture_pressure_source_curve(self.data)
        self.assertEqual(len(strength['points']),4)
        self.assertTrue(_texture_pressure_data_candidate(self.descriptor))
        def structural(curves,provider):
            return [[[0.,0.,1.,0.] for _ in range(len(c)-1)] for c in curves]
        with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=structural) as compiler:
            old=compile_mapped_source_stamp(self.data,PROVIDER)
            new=compile_mapped_source_stamp(self.data,PROVIDER,texture_strength=True)
            verify_mapped_source_stamp(self.data,new,PROVIDER)
        self.assertEqual(old['version'],2)
        self.assertNotIn('textureStrength',old)
        self.assertEqual(new['version'],3)
        self.assertEqual(new['curves'],old['curves'])
        self.assertEqual(new['textureStrength']['curve']['source'],strength)
        self.assertEqual(len(compiler.call_args.args[0]),len(required_source_curves(self.data))+1)
        validate_source_stamp_shape({'sourceStamp':{**self.data,'compiled':new}})
        self.assertEqual(self.data,before)

    def test_no_fallback_or_unknown_raw_sensor(self):
        for xml in ['<params id="fade"><curve>0,0;1,1;</curve></params>',
                    '<!DOCTYPE params [<!ENTITY x "0,0;1,1;">]><params id="pressure"><curve>&x;</curve></params>',
                    '<params id="pressure" extra="x"><curve>0,0;1,1;</curve></params>']:
            data=copy.deepcopy(self.data);data['settings']['Texture/Strength/Sensor']=xml
            self.assertIsNone(texture_pressure_source_curve(data))
            with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=AssertionError('must not invoke')):
                with self.assertRaises(ValueError):compile_mapped_source_stamp(data,PROVIDER,texture_strength=True)

    def test_static_descriptor_gate_and_original_compiled2_no_mutation(self):
        for key in ('randomX','randomY'):
            d=copy.deepcopy(self.descriptor);d['texture']['offset'][key]=True
            self.assertFalse(_texture_pressure_data_candidate(d))
        for key in ('dual','wetMix','grain','colorAdjustment'):
            d=copy.deepcopy(self.descriptor);d.setdefault('behavior',{})[key]={'unsupported':True}
            self.assertFalse(_texture_pressure_data_candidate(d))
        d=copy.deepcopy(self.descriptor);d['texture']['application']['mode']='multiply'
        self.assertFalse(_texture_pressure_data_candidate(d))

    def test_new_slot_structure_mutation_and_budget_refuse_before_provider(self):
        def structural(curves,provider):
            return [[[0.,0.,1.,0.] for _ in range(len(c)-1)] for c in curves]
        with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=structural):
            good=compile_mapped_source_stamp(self.data,PROVIDER,texture_strength=True)
        mutations=[lambda c:c.update(profile='other'),lambda c:c.update(buildId='bad'),
                   lambda c:c['textureStrength'].update(extra=True),
                   lambda c:c['textureStrength']['curve'].update(coefficients=[]),
                   lambda c:c['textureStrength']['curve']['source'].update(text='0,0;1,1;')]
        for change in mutations:
            bad=copy.deepcopy(good);change(bad)
            with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=AssertionError('must not invoke')):
                with self.assertRaises(ValueError):verify_mapped_source_stamp(self.data,bad,PROVIDER)
        for slot in (None,{}, {'kind':'texture-pressure-curve-v1','curve':None}):
            bad=copy.deepcopy(self.data);bad['compiled']={**good,'textureStrength':slot}
            with self.assertRaises(ValueError):validate_source_stamp_shape({'sourceStamp':bad})
        with patch('source_stamp_mapped.MAX_SOURCE_STAMP_BUDGET',1), patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=AssertionError('must not invoke')):
            with self.assertRaises(ValueError):compile_mapped_source_stamp(self.data,PROVIDER,texture_strength=True)

    def test_actual_normal_preset_provider_failure_never_publishes_partial3_or2(self):
        import io,tempfile
        from PIL import Image, PngImagePlugin
        from test_krita import kpp
        from brush_contract import Catalog
        from krita_import import convert_krita
        # Self-authored KPP and pattern; no artwork/native coefficients claim.
        fields=dict(self.data['settings'])
        fields.update({'Texture/Pattern/PatternFileName':'self.png','Texture/Pattern/TexturingMode':'1',
                       'Texture/Pattern/UseSoftTexturing':'false','Texture/Pattern/OffsetX':'0',
                       'Texture/Pattern/OffsetY':'0','Texture/Pattern/isRandomOffsetX':'false',
                       'Texture/Pattern/isRandomOffsetY':'false'})
        params=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>' for k,v in fields.items())
        pixels=io.BytesIO();Image.new('L',(8,8),128).save(pixels,format='PNG')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'self.kpp'
            info=PngImagePlugin.PngInfo();info.add_text('version','5.0')
            info.add_text('preset','<Preset name="QA" paintopid="paintbrush">'+params+'</Preset>',zip=True)
            Image.new('RGB',(2,2),'red').save(path,format='PNG',pnginfo=info)
            catalog=Catalog(root/'out')
            with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=ValueError('owned provider failure')) as native:
                convert_krita(path,catalog,{'self.png':pixels.getvalue()},mapped_curve_provider=PROVIDER)
            self.assertEqual(native.call_count,1)
            brush=catalog.brushes[0]
            self.assertNotIn('compiled',brush['descriptor']['sourceStamp'])
            self.assertNotEqual(brush['descriptor']['version'],37)
            self.assertTrue(any(n['feature']=='sourceStampCompiler' and n['status']=='unsupported'
                                and 'owned provider failure' in n['detail'] for n in brush['compatibility']))

if __name__=='__main__':unittest.main()
