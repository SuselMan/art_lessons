"""Production raw native option retention, self-authored inputs only."""
import io
import struct
import base64
import json
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image
import convert
from krita_import import convert_krita, xml
from source_stamp_data import retain_source_stamp, validate_portable_source_stamp
from test_krita import kpp


def data(params=None,definition='<Brush type="png_brush" filename="self.png" BrushVersion="2"/>',depth=0):
    params={'brush_definition':definition,**(params or {})}
    return retain_source_stamp(params,xml(definition),3,5,xml,depth=depth)


class SourceStampDataTests(unittest.TestCase):
    def test_texture_strength_raw_program_is_retained_without_flattening_or_new_option(self):
        identity='<!DOCTYPE params> <params id="pressure"> <curve>0,0;1,1;</curve> </params> '
        multiple='<params id="sensorslist"><ChildSensor id="pressure"><curve>0,0;1,1;</curve></ChildSensor><ChildSensor id="fuzzy"><curve>0,1;1,0;</curve></ChildSensor></params>'
        for use_curve,sensor in [('true',identity),('false',identity),('true',multiple)]:
            with self.subTest(use_curve=use_curve,sensor=sensor):
                params={'PressureTexture/Strength/':'true','Texture/Pattern/Enabled':'true',
                        'Texture/Strength/StrengthVersion':'2','Texture/Strength/UseCurve':use_curve,
                        'Texture/Strength/UseSameCurve':'false','Texture/Strength/Value':'1',
                        'Texture/Strength/curveMode':'0','Texture/Strength/Sensor':sensor,
                        'Texture/Strength/commonCurve':'0,1;1,0;',
                        'CustomTexture/Strength/':'true','CurveTexture/Strength/':'0,0;1,1;'}
                result=data(params)
                for key,value in params.items():self.assertEqual(result['settings'][key],value)
                self.assertEqual(len(result['options']),9)
                self.assertEqual(result['version'],data()['version'])
                validate_portable_source_stamp({'sourceStamp':result})

    def test_unrelated_settings_do_not_change_historical_source_bytes(self):
        baseline=json.dumps(data(),sort_keys=True,separators=(',',':'))
        # Captured from unmodified parent raw-retention implementation.
        self.assertEqual(hashlib.sha256(baseline.encode()).hexdigest(),'dbc572ca5a51a2ad051b40c9b3d21da94ee9234e2ddaa60d203db898b3602021')
        self.assertEqual(json.dumps(data({'UnrelatedSetting':'unchanged'}),sort_keys=True,separators=(',',':')),baseline)
        self.assertFalse(any(key.startswith('Texture/Strength/') for key in data()['settings']))

    def test_decimal_grammar_rejects_hex_nan_and_underscores(self):
        from source_stamp_data import curve_data
        for curve in ('0,0;0x1,1;','0,0;1_0,1;','0,0;NaN,1;'):
            with self.assertRaises(ValueError):curve_data(curve)
        self.assertEqual(curve_data('0e0,+.0;1.,1e0;')['points'][-1]['x'],1)

    def test_repeated_selected_curve_budget_blocks_before_unbounded_expansion(self):
        curve=' '*64000+'0,0;1,1;'
        params={name+'commonCurve':curve for name in ('Size','Rotation','Ratio','Scatter','Opacity','Flow','Mirror','Spacing','Rate')}
        d=data(params)
        self.assertFalse(d['options'])
        self.assertIn('Source stamp aggregate budget exceeded',d['unsupported'])
        validate_portable_source_stamp({'sourceStamp':d})

    def test_library_aggregate_budget_precedes_asset_payload_decoding(self):
        d=data({'PressureUnused'+str(i):'x'*60000 for i in range(16)})
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);bundle=root/'oversized.json'
            library={'schemaVersion':1,'assets':[{'intentionally':'invalid; must not be reached'}],'skipped':[],
                     'brushes':[{'descriptor':{'sourceStamp':d}} for _ in range(18)]}
            bundle.write_text(json.dumps({'library':library,'assets':{}}))
            with patch('convert.base64.b64decode',side_effect=AssertionError('CAS decoded before source preflight')):
                with self.assertRaisesRegex(ValueError,'library budget'):convert.portable_bundle(bundle,convert.Catalog(root/'out'))

    def test_material_unit_constant_matches_native_standard_option_guard_only(self):
        for option in ('Softness','LightnessStrength'):
            disabled={'Pressure'+option:'false',option+'UseCurve':'true',option+'Value':'.2'}
            self.assertTrue(data(disabled)['flags']['materialFixed1'])
            constant={'Pressure'+option:'true',option+'UseCurve':'false',option+'Value':'1',option+'Sensor':'<params id="fuzzy"><curve>0,0;1,0.5;</curve></params>'}
            self.assertTrue(data(constant)['flags']['materialFixed1'])
            for changed in ({option+'UseCurve':'true'},{option+'Value':'.9'},{option+'Value':'2'}):
                self.assertFalse(data({**constant,**changed})['flags']['materialFixed1'])
        for option in ('Sharpness','h','s','v','Darken','Mix'):
            self.assertFalse(data({'Pressure'+option:'true',option+'UseCurve':'false',option+'Value':'1'})['flags']['materialFixed1'])

    def test_original_decoded_tip_scope_survives_png_texture_filename_shadow(self):
        def frame(value):return struct.pack('>7I',29,2,3,3,1,0x47494d50,25)+b'\0'+bytes([value])*9
        texture=io.BytesIO();Image.new('L',(4,4),127).save(texture,format='PNG')
        settings='<param name="Texture/Pattern/Enabled">true</param><param name="Texture/Pattern/PatternFileName">paper.png</param>'
        for count in (1,2):
            with tempfile.TemporaryDirectory() as temp:
                root=Path(temp);pipe=(f'Authored\n{count} dim:1 rank0:{count} sel0:random\n').encode()+b''.join(frame(64+i*64)for i in range(count))
                path=root/'pipe.kpp';path.write_bytes(kpp('<Brush type="gbr_brush" filename="tip.gih" BrushVersion="2"/>',resources=settings))
                catalog=convert.Catalog(root/'out');convert_krita(path,catalog,{'tip.gih':pipe,'paper.png':texture.getvalue()})
                self.assertFalse(catalog.skipped);d=catalog.brushes[0]['descriptor']
                self.assertEqual(d['tip']['kind'],'bitmap');self.assertIn('texture',d)
                frame_ids=d['tip'].get('animation',{}).get('frames',[d['tip']['mask']])
                self.assertEqual(len(frame_ids),count)
                self.assertNotIn(d['texture']['id'],frame_ids)
                for i,asset_id in enumerate(frame_ids):
                    payload=(catalog.output/catalog.assets[asset_id]['file']).read_bytes()
                    self.assertEqual(payload,b''.join(bytes([64+i*64])*3+b'\0' for _ in range(3))+bytes(4))
                if count==1:
                    # The pipe capability explicitly requires at least two frames.
                    self.assertNotIn('sourceStamp',d)
                else:
                    stamp=d['sourceStamp']
                    self.assertEqual(stamp['source'],{'kind':'image'})
                    self.assertEqual((stamp['brush']['width'],stamp['brush']['height']),(3,3))
                    self.assertEqual(stamp['settings']['brush_definition'],'<Brush type="gbr_brush" filename="tip.gih" BrushVersion="2"/>')
                    self.assertNotIn('paper.png',stamp['settings']['brush_definition'])
                    self.assertTrue(stamp['flags']['textureEnabled'])
                    self.assertEqual(d['tip']['animation']['mode'],'random')
                    self.assertEqual(d['tip']['mask'],frame_ids[0])
                    self.assertEqual(d['tip']['imageSampling']['sourceRect'],{'x':0,'y':0,'width':3,'height':3})
                    validate_portable_source_stamp(d)
                path=root/'static.kpp';tip=io.BytesIO();Image.new('L',(3,5),0).save(tip,format='PNG')
                path.write_bytes(kpp('<Brush type="png_brush" filename="tip.png" BrushVersion="2"/>',resources=settings))
                static=convert.Catalog(root/'static');convert_krita(path,static,{'tip.png':tip.getvalue(),'paper.png':texture.getvalue()})
                self.assertFalse(static.skipped);stamp=static.brushes[0]['descriptor']['sourceStamp']
                self.assertEqual(stamp['brush']['width'],3);self.assertIn('filename="tip.png"',stamp['settings']['brush_definition']);self.assertTrue(stamp['flags']['textureEnabled'])

    def test_primary_source_slots_and_common_last_read_not_slot_order(self):
        raw='<params id="sensorslist"><ChildSensor id="fuzzy"><curve>0,0;1,1;</curve></ChildSensor><ChildSensor id="pressure"><curve>0,0;0.375,0.125,is_corner;1,1;</curve></ChildSensor></params>'
        d=data({'SizeSensor':raw,'PressureSize':'true','SizecurveMode':'3'})
        size=d['options'][0]
        self.assertEqual([s['sourceSlot'] for s in size['sensors']],[0,9])
        self.assertEqual(size['curveMode'],3)
        self.assertTrue(all(s['curve']['text']=='0,0;0.375,0.125,is_corner;1,1;' for s in size['sensors']))
        self.assertTrue(size['sensors'][0]['curve']['points'][1]['corner'])
        self.assertEqual(d['settings']['SizeSensor'],raw)
        validate_portable_source_stamp({'sourceStamp':d})

    def test_per_sensor_curve_and_legacy_custom(self):
        d=data({'SizeSensor':'<params id="fuzzy"/>','SizeUseSameCurve':'false','CustomSize':'true','CurveSize':'0,0;0.3,0.7;1,1;'})
        self.assertEqual(d['options'][0]['sensors'][0]['curve']['text'],'0,0;0.3,0.7;1,1;')
        self.assertFalse(d['options'][0]['useSameCurve'])
        self.assertFalse(d['options'][0]['checked'])
        self.assertTrue(d['options'][4]['checked']);self.assertFalse(d['options'][4]['checkable'])
        self.assertTrue(d['options'][5]['checked']);self.assertFalse(d['options'][5]['checkable'])

    def test_native_brush_factory_defaults_and_legacy_scale(self):
        d=data(definition='<Brush type="png_brush" filename="self.png"/>')
        self.assertEqual(d['brush']['scale'],2)
        self.assertEqual(d['spacing']['value'],.25)
        self.assertEqual(d['precision'],{'level':5,'automatic':False})
        d=data({'KisPrecisionOption/precisionLevel':'2','KisPrecisionOption/AutoPrecisionEnabled':'true'})
        self.assertEqual(d['precision'],{'level':2,'automatic':True})

    def test_law_parameters_and_float32_angle_are_retained(self):
        d=data({'RotationSensor':'<params id="drawingangle" angleOffset="0.1" lockedAngleMode="1" fanCornersEnabled="1" fanCornersStep="17"/>','SizeSensor':'<params id="time" duration="321" periodic="1"/>'})
        law=d['options'][1]['sensors'][0]
        self.assertEqual(law['angleOffset'],0.10000000149011612)
        self.assertEqual((law['fanStep'],law['lockedAngle'],law['fanCorners']),(17,True,True))
        self.assertEqual(d['options'][0]['sensors'][0]['length'],321)

    def test_unknown_or_duplicate_sensor_retains_raw_but_explicitly_blocks_candidate(self):
        for raw in ('<params id="newvendor"/>','<params id="sensorslist"><ChildSensor id="pressure"/><ChildSensor id="pressure"/></params>'):
            d=data({'SizeSensor':raw})
            self.assertEqual(d['options'],[]);self.assertTrue(d['unsupported']);self.assertEqual(d['settings']['SizeSensor'],raw)
            validate_portable_source_stamp({'sourceStamp':d})
        d=data(depth=1);self.assertEqual(d['role'],'mask');self.assertIn('mask-prefix-and-master-size-unresolved',d['unsupported'])

    def test_portable_rejects_modified_normalized_program_and_raw_curve_disagreement(self):
        for change in (lambda d:d['options'][0].update(checked=True),lambda d:d['brush'].update(scale=37),lambda d:d['options'][0]['commonCurve']['points'][0].update(y=.2),lambda d:d.update(extra=1),lambda d:d['options'][4].update(checked=1)):
            d=data();change(d)
            with self.assertRaises(ValueError):validate_portable_source_stamp({'sourceStamp':d})

    def test_real_importer_retains_arbitrary_raw_nonlinear_curve_without_activating_behavior(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);path=root/'self.kpp';path.write_bytes(kpp('<Brush type="png_brush" filename="self.png" BrushVersion="2"/>'))
            out=io.BytesIO();Image.new('L',(3,5),0).save(out,format='PNG')
            catalog=convert.Catalog(root/'out');convert_krita(path,catalog,{'self.png':out.getvalue()})
            self.assertFalse(catalog.skipped)
            d=catalog.brushes[0]['descriptor'];retained=d['sourceStamp']
            self.assertEqual(retained['options'][0]['commonCurve']['text'],'0,0;0.5,0.2;1,1;')
            self.assertEqual(retained['brush']['width'],3)
            self.assertNotIn('sequentialRandom',d['behavior'])
            self.assertNotIn('strokeInput',d['behavior'])
            validate_portable_source_stamp(d)
            library=catalog.write()
            payloads={asset['id']:base64.b64encode((catalog.output/asset['file']).read_bytes()).decode() for asset in library['assets']}
            bundle=root/'bundle.grafetto-brushes';bundle.write_text(json.dumps({'library':library,'assets':payloads}))
            loaded=convert.Catalog(root/'loaded');convert.portable_bundle(bundle,loaded)
            self.assertEqual(loaded.brushes[0]['descriptor']['sourceStamp'],d['sourceStamp'])
            d['sourceStamp']['options'][0]['checked']=True
            bundle.write_text(json.dumps({'library':library,'assets':payloads}))
            with self.assertRaisesRegex(ValueError,'differs from raw'):convert.portable_bundle(bundle,convert.Catalog(root/'invalid'))

if __name__=='__main__':unittest.main()
