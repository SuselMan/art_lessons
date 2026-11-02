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


class NativeDefaultSoftDataTests(unittest.TestCase):
    def native_raw(self):
        from source_stamp_data import retain_source_stamp
        from krita_import import xml
        definition='<Brush type="auto_brush"><MaskGenerator id="soft" type="circle" diameter="7" ratio=".5" softness_curve="0,1;1,0"/></Brush>'
        params={'brush_definition':definition,'Texture/Pattern/Enabled':'true','PressureTexture/Strength/':'true',
                'Texture/Strength/StrengthVersion':'2','Texture/Strength/UseCurve':'true','Texture/Strength/UseSameCurve':'true',
                'Texture/Strength/Value':'1','Texture/Strength/curveMode':'0','Texture/Strength/Sensor':'<!DOCTYPE params> <params id="pressure"/> '}
        return retain_source_stamp(params,xml(definition),7,3,xml)

    def test_native_default_distinct_provider_inputs_and_preserved_raw(self):
        from source_stamp_data import texture_native_default_source_curve
        data=self.native_raw();before=copy.deepcopy(data);captured=[]
        def provider(curves,_provider):
            captured.extend(copy.deepcopy(curves))
            return [[[0.,0.,1.,0.] for _ in range(len(c)-1)] for c in curves]
        with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=provider):
            baseline=compile_mapped_source_stamp(data,PROVIDER)
            result=compile_mapped_source_stamp(data,PROVIDER,native_default_texture=True)
            verify_mapped_source_stamp(data,result,PROVIDER)
        self.assertEqual(data,before);self.assertEqual(baseline['version'],2);self.assertEqual(result['version'],4)
        self.assertEqual(result['textureStrength']['kind'],'texture-pressure-native-default-v1')
        self.assertEqual(result['textureStrength']['curve']['source'],texture_native_default_source_curve(data))
        self.assertEqual(captured[-1],[[0.,0.,False],[1.,1.,False]])
        self.assertEqual(result['curves'],baseline['curves']);self.assertEqual(result['radialCurve'],baseline['radialCurve'])
        self.assertEqual(len(data['options']),9);self.assertEqual(data['source']['kind'],'softAuto')
        validate_source_stamp_shape({'sourceStamp':{**data,'compiled':result}})

    def test_native_default_closed_raw_grammar_before_provider(self):
        from source_stamp_data import texture_native_default_source_curve
        base=self.native_raw()
        edits=[('CustomTexture/Strength/','false'),('CurveTexture/Strength/','0,0;1,1;'),
               ('Texture/Strength/commonCurve',''),('Texture/Strength/UseCurve','false'),
               ('Texture/Strength/UseSameCurve','false'),('Texture/Strength/Value','.5'),
               ('Texture/Strength/curveMode','1'),('PressureTexture/Strength/','false'),
               ('Texture/Strength/Sensor','<params id="pressure" extra="1"/>'),
               ('Texture/Strength/Sensor','<params id="pressure"><curve>0,0;1,1;</curve></params>'),
               ('Texture/Strength/Sensor','<params id="sensorslist"><ChildSensor id="pressure"/></params>')]
        for key,value in edits:
            data=copy.deepcopy(base);data['settings'][key]=value
            self.assertIsNone(texture_native_default_source_curve(data),(key,value))
            with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=AssertionError('must not invoke')):
                with self.assertRaises(ValueError):compile_mapped_source_stamp(data,PROVIDER,native_default_texture=True)
        with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=AssertionError('must not invoke')):
            with self.assertRaises(ValueError):compile_mapped_source_stamp(base,PROVIDER,texture_strength=True,native_default_texture=True)

    def test_native_default_version_kind_budget_and_provider_failure(self):
        base=self.native_raw()
        with patch('source_stamp_mapped.compile_curves_arm_v3',return_value=[[[0.,0.,1.,0.]],[[0.,0.,1.,0.]]]):
            good=compile_mapped_source_stamp(base,PROVIDER,native_default_texture=True)
        from source_stamp_mapped import validate_mapped_source_stamp_shape
        for change in [lambda c:c.update(version=3),lambda c:c['textureStrength'].update(kind='texture-pressure-curve-v1'),
                       lambda c:c.pop('radialCurve'),lambda c:c.update(extra=True),
                       lambda c:c['textureStrength']['curve']['source'].update(text='0,0;1,.5;')]:
            bad=copy.deepcopy(good);change(bad)
            with self.assertRaises(ValueError):validate_mapped_source_stamp_shape(base,bad)
        with patch('source_stamp_mapped.MAX_SOURCE_STAMP_BUDGET',1),patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=AssertionError('must not invoke')):
            with self.assertRaises(ValueError):compile_mapped_source_stamp(base,PROVIDER,native_default_texture=True)
        before=copy.deepcopy(base)
        with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=ValueError('native provider failure')):
            with self.assertRaisesRegex(ValueError,'native provider failure'):compile_mapped_source_stamp(base,PROVIDER,native_default_texture=True)
        self.assertEqual(base,before);self.assertNotIn('compiled',base)


class NativeDefaultNormalImportTests(unittest.TestCase):
    def test_normal_kpp_explicit_option_preserves_raw_and_off_outcome(self):
        import io,tempfile
        from PIL import Image,PngImagePlugin
        from brush_contract import Catalog
        from krita_import import convert_krita
        data=NativeDefaultSoftDataTests().native_raw();fields=dict(data['settings'])
        fields.update({'Texture/Pattern/PatternFileName':'self.png','Texture/Pattern/TexturingMode':'1',
          'Texture/Pattern/UseSoftTexturing':'false','Texture/Pattern/OffsetX':'0','Texture/Pattern/OffsetY':'0',
          'Texture/Pattern/isRandomOffsetX':'false','Texture/Pattern/isRandomOffsetY':'false'})
        params=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>'for k,v in fields.items())
        image=io.BytesIO();Image.new('L',(8,8),128).save(image,format='PNG')
        def structural(curves,_provider):return [[[0.,0.,1.,0.]for _ in range(len(c)-1)]for c in curves]
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'self.kpp';info=PngImagePlugin.PngInfo();info.add_text('version','5.0')
            info.add_text('preset','<Preset name="Self authored default" paintopid="paintbrush">'+params+'</Preset>',zip=True)
            Image.new('RGB',(2,2),'red').save(path,format='PNG',pnginfo=info)
            off=Catalog(root/'off');on=Catalog(root/'on')
            with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=structural):
                convert_krita(path,off,{'self.png':image.getvalue()},mapped_curve_provider=PROVIDER)
                convert_krita(path,on,{'self.png':image.getvalue()},mapped_curve_provider=PROVIDER,native_default_texture=True)
            old=off.brushes[0]['descriptor']['sourceStamp'];new=on.brushes[0]['descriptor']['sourceStamp']
            self.assertEqual(old['compiled']['version'],2);self.assertEqual(new['compiled']['version'],4)
            self.assertEqual({k:v for k,v in old.items()if k!='compiled'},{k:v for k,v in new.items()if k!='compiled'})
            self.assertEqual(new['settings']['Texture/Strength/Sensor'],fields['Texture/Strength/Sensor'])
            self.assertEqual(new['source']['kind'],'softAuto');self.assertEqual(len(new['options']),9)
            failed=Catalog(root/'failed')
            with patch('source_stamp_mapped.compile_curves_arm_v3',side_effect=ValueError('native-default owned failure')):
                convert_krita(path,failed,{'self.png':image.getvalue()},mapped_curve_provider=PROVIDER,native_default_texture=True)
            failure=failed.brushes[0];self.assertNotIn('compiled',failure['descriptor']['sourceStamp'])
            self.assertEqual(failure['descriptor']['sourceStamp']['settings'],new['settings'])
            self.assertTrue(any(x['feature']=='sourceStampCompiler' and x['status']=='unsupported' for x in failure['compatibility']))
